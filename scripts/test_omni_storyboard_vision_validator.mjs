import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-storyboard-vision-"));
const compiled = join(output, "compiled");
const config = join(output, "tsconfig.json");
const require = createRequire(import.meta.url);
const originalFetch = global.fetch;
const originalKey = process.env.OPENROUTER_API_KEY;

try {
  writeFileSync(config, JSON.stringify({
    compilerOptions: {
      target: "es2022",
      module: "commonjs",
      moduleResolution: "node",
      baseUrl: join(ui, "src"),
      paths: { "@/*": ["*"] },
      rootDir: join(ui, "src"),
      outDir: compiled,
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      types: ["node"],
      typeRoots: [join(ui, "node_modules/@types")],
    },
    include: [
      join(ui, "src/lib/omni/**/*.ts"),
      join(ui, "src/lib/server/omni/storyboard-vision-contract.ts"),
      join(ui, "src/lib/server/omni/script-json-repair.ts"),
      join(ui, "src/lib/server/omni/storyboard-vision-validator.ts"),
      join(ui, "src/lib/server/omni/storyboard-set-vision-validator.ts"),
      join(ui, "src/lib/server/omni/omni-segment-continuity-validator.ts"),
    ],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", config], { cwd: ui, stdio: "inherit" });
  const validator = require(findFile(compiled, "storyboard-vision-contract.js"));
  const visionValidator = require(findFile(compiled, "storyboard-vision-validator.js"));
  const setVisionValidator = require(findFile(compiled, "storyboard-set-vision-validator.js"));
  const segmentContinuityValidator = require(findFile(compiled, "omni-segment-continuity-validator.js"));

  const pass = validator.normalizeStoryboardVisionValidation({
    status: "pass",
    confidence: 0.96,
    panels: [{ panel_index: 5, status: "pass", violations: [] }],
  }, "test-model");
  assert.equal(pass.status, "pass");

  const repair = validator.normalizeStoryboardVisionValidation({
    status: "repair",
    confidence: 0.93,
    panels: [{
      panel_index: 5,
      status: "repair",
      violations: [{ code: "HAND_CAPACITY_CONFLICT", severity: "error", evidence: "one hand holds the jar" }],
    }],
    repair_instructions: ["touch one cheek"],
  });
  assert.equal(repair.status, "repair");
  assert.deepEqual(repair.repairInstructions, ["touch one cheek"]);

  const lowConfidence = validator.normalizeStoryboardVisionValidation({
    status: "pass",
    confidence: 0.42,
    panels: [{ panel_index: 1, status: "pass", violations: [] }],
  });
  assert.equal(lowConfidence.status, "block");
  assert.equal(validator.isStoryboardVisionValidationInconclusive(lowConfidence), true);

  const actionableBlock = validator.normalizeStoryboardVisionValidation({
    status: "block",
    confidence: 0.9,
    panels: [{
      panel_index: 1,
      status: "block",
      violations: [{ code: "AVATAR_IDENTITY_MISMATCH", severity: "error", evidence: "different hair and face" }],
    }],
  });
  assert.equal(validator.isStoryboardVisionValidationInconclusive(actionableBlock), false);
  assert.deepEqual(validator.getStoryboardVisionRepairInstructions(actionableBlock), [
    "Panel 1: AVATAR_IDENTITY_MISMATCH — different hair and face",
  ]);

  const numericStringConfidence = validator.normalizeStoryboardVisionValidation({
    status: "pass",
    confidence: "0.96",
    panels: [{ panel_index: 1, status: "pass", violations: [] }],
  });
  assert.equal(numericStringConfidence.status, "pass");

  const evidenceFreeRepair = validator.normalizeStoryboardVisionValidation({
    status: "block",
    confidence: 0.8,
    panels: [
      { panel_index: 1, status: "repair", violations: [] },
      { panel_index: 2, status: "repair", violations: [] },
    ],
    repair_instructions: [],
  });
  assert.equal(evidenceFreeRepair.status, "pass");

  process.env.OPENROUTER_API_KEY = "test-key";
  const requests = [];
  global.fetch = async (_url, init) => {
    requests.push(JSON.parse(String(init.body)));
    const content = requests.length === 1
      ? '{"status":"repair","confidence":0.9,"panels":[{"panel_index":1,"status":"repair","violations":[]},"repair_instructions":[]}'
      : JSON.stringify({
        status: "repair",
        confidence: 0.9,
        panels: [{
          panel_index: 1,
          status: "repair",
          violations: [{ code: "ACTION_MISMATCH", severity: "error", evidence: "hand position differs" }],
        }],
        repair_instructions: [],
      });
    return {
      ok: true,
      json: async () => ({ model: "test/vision", choices: [{ message: { content } }] }),
    };
  };
  const recovered = await visionValidator.validateStoryboardImage({
    imageUrl: "https://example.com/storyboard.jpg",
    avatarReferenceUrl: "https://example.com/avatar.jpg",
    productName: "Тестовый продукт",
    storyboard: { segmentIndex: 1, durationSeconds: 4, voiceoverText: "Тест", frames: [] },
  });
  assert.equal(recovered.status, "repair");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].messages[1].content[1].type, "image_url");
  assert.match(requests[1].messages[1].content, /Malformed response/);
  assert.equal(requests[1].response_format.type, "json_object");

  const setRequests = [];
  global.fetch = async (_url, init) => {
    setRequests.push(JSON.parse(String(init.body)));
    return {
      ok: true,
      json: async () => ({
        model: "test/cross-storyboard-vision",
        choices: [{ message: { content: JSON.stringify({
          status: "block",
          confidence: 0.95,
          canonical_identity: "black sleeveless top and hair in a bun",
          violations: [
            { segment_index: 2, panels: [1, 2, 3, 4, 5], code: "wardrobe_change", severity: "error", evidence: "white long-sleeved top" },
            { segment_index: 3, panels: [1, 2, 3, 4, 5], code: "hair_change", severity: "error", evidence: "hair is down" },
          ],
          repair_instructions: ["restore the canonical outfit and hair"],
        }) } }],
      }),
    };
  };
  const setValidation = await setVisionValidator.validateStoryboardSet({
    storyboards: [1, 2, 3].map((segmentIndex) => ({
      segmentIndex,
      imageUrl: `https://example.com/storyboard-${segmentIndex}.jpg`,
      storyboard: {
        segmentIndex,
        durationSeconds: 4,
        voiceoverText: "Тест",
        frames: [{ wardrobe: "black sleeveless top" }],
      },
    })),
  });
  assert.equal(setValidation.status, "block");
  assert.deepEqual(setVisionValidator.getStoryboardSetRepairSegments(setValidation), [2, 3]);
  assert.deepEqual(setVisionValidator.getStoryboardSetRepairSegments({
    violations: [{ segmentIndex: 1, severity: "error" }],
  }), [1], "a failed canonical storyboard must be eligible for targeted repair");
  const setImages = setRequests[0].messages[0].content.filter((item) => item.type === "image_url");
  assert.equal(setImages.length, 3, "cross-storyboard QA must see all contact sheets in one request");

  await setVisionValidator.validateStoryboardSet({
    storyboards: [1, 2, 3].map((segmentIndex) => ({
      segmentIndex,
      imageUrl: `https://example.com/storyboard-${segmentIndex}.jpg`,
      storyboard: { segmentIndex, durationSeconds: 4, voiceoverText: "Тест", frames: [{ wardrobe: "black sleeveless top" }] },
    })),
    avatarReferenceUrl: "https://example.com/avatar.jpg",
    productName: "Тестовый продукт",
    productReferenceUrls: ["https://example.com/product-front.jpg", "https://example.com/product-back.jpg"],
  });
  const referencedSetImages = setRequests[1].messages[0].content.filter((item) => item.type === "image_url");
  assert.equal(referencedSetImages.length, 6, "cross-storyboard QA must see avatar, product, and all contact sheets together");

  const continuityRequests = [];
  global.fetch = async (_url, init) => {
    continuityRequests.push(JSON.parse(String(init.body)));
    return {
      ok: true,
      json: async () => ({
        model: "test/segment-continuity",
        choices: [{ message: { content: JSON.stringify({
          status: "repair",
          confidence: 0.94,
          violations: [{ code: "wardrobe_change", severity: "error", evidence: "white long sleeves replace the canonical black top" }],
          repair_instructions: ["restore the canonical black sleeveless top"],
        }) } }],
      }),
    };
  };
  const continuity = await segmentContinuityValidator.validateSegmentContinuityFrame({
    segmentIndex: 2,
    frameUrl: "https://example.com/segment-02-last-frame.jpg",
    storyboardUrl: "https://example.com/storyboard-02.jpg",
    canonicalStoryboardUrl: "https://example.com/storyboard-01.jpg",
  });
  assert.equal(continuity.status, "repair");
  assert.deepEqual(segmentContinuityValidator.getSegmentContinuityRepairInstructions(continuity), [
    "restore the canonical black sleeveless top",
    "wardrobe_change: white long sleeves replace the canonical black top",
  ]);
  const continuityImages = continuityRequests[0].messages[0].content.filter((item) => item.type === "image_url");
  assert.equal(continuityImages.length, 3, "final-frame QA must compare generated frame, current storyboard, and canonical storyboard");

  console.log("Omni storyboard vision validator checks passed");
} finally {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalKey;
  rmSync(output, { recursive: true, force: true });
}

function findFile(directory, fileName) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      try { return findFile(path, fileName); } catch { continue; }
    }
    if (entry.name === fileName) return path;
  }
  throw new Error(`Could not find ${fileName}`);
}
