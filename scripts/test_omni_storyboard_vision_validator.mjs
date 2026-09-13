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
    ],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", config], { cwd: ui, stdio: "inherit" });
  const validator = require(findFile(compiled, "storyboard-vision-contract.js"));
  const visionValidator = require(findFile(compiled, "storyboard-vision-validator.js"));
  const setVisionValidator = require(findFile(compiled, "storyboard-set-vision-validator.js"));
  const wardrobe = require(findFile(compiled, "director-wardrobe.js"));

  assert.equal(wardrobe.requiresContinuousPresenterWardrobe({
    referenceFormatMode: "continuous_story",
    referenceSceneMode: "presenter",
  }), true);
  assert.equal(wardrobe.requiresContinuousPresenterWardrobe({
    referenceFormatMode: "voiceover_montage",
    referenceSceneMode: "presenter",
  }), false, "montage alone does not require one outfit across independent setups");
  assert.equal(wardrobe.requiresContinuousPresenterWardrobe({
    referenceFormatMode: "continuous_story",
    referenceSceneMode: "voiceover_broll",
  }), false);

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
      violations: [{ code: "PRODUCT_PACKAGING_MISMATCH", severity: "error", evidence: "visible jar label differs from the client reference" }],
    }],
    repair_instructions: ["restore the visible client package"],
  });
  assert.equal(repair.status, "repair");
  assert.deepEqual(repair.repairInstructions, ["restore the visible client package"]);

  const lowConfidence = validator.normalizeStoryboardVisionValidation({
    status: "pass",
    confidence: 0.42,
    panels: [{ panel_index: 1, status: "pass", violations: [] }],
  });
  assert.equal(lowConfidence.status, "pass", "uncertain static QA must not spend an image retry");
  assert.equal(validator.isStoryboardVisionValidationInconclusive(lowConfidence), false);

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
          violations: [{ code: "PRODUCT_PACKAGING_MISMATCH", severity: "error", evidence: "visible label differs from product reference" }],
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
  assert.equal(setValidation.status, "pass");
  assert.deepEqual(setVisionValidator.getStoryboardSetRepairSegments(setValidation), []);
  assert.deepEqual(setVisionValidator.getStoryboardSetRepairSegments({
    violations: [{ segmentIndex: 1, severity: "error", code: "wardrobe_mismatch", evidence: "visible sleeve changed" }],
  }), [], "wardrobe must not trigger targeted repair");
  const wardrobeMismatchResponse = {
    status: "repair",
    confidence: 0.95,
    violations: [{
      segment_index: 2,
      panels: [1, 2],
      code: "PRESENTER_WARDROBE_CONTINUITY_MISMATCH",
      severity: "error",
      evidence: "segment one has a black sweatshirt while segment two has a black short-sleeve T-shirt",
    }],
    repair_instructions: ["restore the exact outfit from contact sheet one"],
  };
  const continuousPresenterWardrobe = setVisionValidator.normalizeStoryboardSetVisionValidation(
    wardrobeMismatchResponse,
    undefined,
    { allowPresenterWardrobeContinuity: true },
  );
  assert.equal(continuousPresenterWardrobe.status, "repair");
  assert.deepEqual(setVisionValidator.getStoryboardSetRepairSegments(continuousPresenterWardrobe), [2]);
  const montageWardrobeMismatch = setVisionValidator.normalizeStoryboardSetVisionValidation(wardrobeMismatchResponse);
  assert.equal(montageWardrobeMismatch.status, "pass");
  assert.deepEqual(setVisionValidator.getStoryboardSetRepairSegments(montageWardrobeMismatch), []);
  const softReferenceOnly = setVisionValidator.normalizeStoryboardSetVisionValidation({
    status: "block",
    confidence: 0.95,
    violations: [{
      segment_index: 1,
      panels: [1],
      code: "reference_action_missing",
      severity: "error",
      evidence: "hands are not clasped as in the reference",
    }],
    repair_instructions: ["restore the exact reference hand pose"],
  });
  assert.equal(softReferenceOnly.status, "pass", "a soft reference gesture must not block a valid storyboard");
  assert.deepEqual(softReferenceOnly.violations, []);
  const croppedAccessoryOnly = setVisionValidator.normalizeStoryboardSetVisionValidation({
    status: "repair",
    confidence: 0.95,
    violations: [{
      segment_index: 2,
      panels: [1],
      code: "accessory_mismatch",
      severity: "error",
      evidence: "watch is outside the crop and not visible",
    }],
  });
  assert.equal(croppedAccessoryOnly.status, "pass", "cropped accessories must not trigger regeneration");
  assert.deepEqual(setVisionValidator.getStoryboardSetRepairSegments(croppedAccessoryOnly), []);
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
    referenceFormatMode: "continuous_story",
    referenceSceneMode: "presenter",
  });
  const referencedSetImages = setRequests[1].messages[0].content.filter((item) => item.type === "image_url");
  assert.equal(referencedSetImages.length, 6, "cross-storyboard QA must see contact sheets, the avatar identity reference, and product references");
  const referencedSetPrompt = setRequests[1].messages[0].content[0].text;
  assert.match(referencedSetPrompt, /saved avatar identity authority/iu);
  assert.match(referencedSetPrompt, /Ignore its clothing and background/iu);
  assert.match(referencedSetPrompt, /Contact sheet one establishes the canonical outfit/u);
  assert.match(referencedSetPrompt, /PRESENTER_WARDROBE_CONTINUITY_MISMATCH/u);
  assert.match(referencedSetPrompt, /never compare clothing with the avatar or source reference/u);
  assert.match(referencedSetPrompt, /first 3 image\(s\) are contact sheets/u);
  assert.equal(referencedSetImages[0].image_url.url, "https://example.com/storyboard-1.jpg");

  await setVisionValidator.validateStoryboardSet({
    storyboards: [1, 2, 3].map((segmentIndex) => ({
      segmentIndex,
      imageUrl: `https://example.com/montage-storyboard-${segmentIndex}.jpg`,
      storyboard: { segmentIndex, durationSeconds: 4, voiceoverText: "Тест", frames: [{ wardrobe: "scene-specific outfit" }] },
    })),
    referenceFormatMode: "voiceover_montage",
    referenceSceneMode: "voiceover_broll",
  });
  const montageSetPrompt = setRequests[2].messages[0].content[0].text;
  assert.match(montageSetPrompt, /background people in non-product panels/u);
  assert.match(montageSetPrompt, /PRODUCT_BROLL_HAS_HUMAN_INTERACTION/u);
  assert.doesNotMatch(montageSetPrompt, /PRESENTER_WARDROBE_CONTINUITY_MISMATCH/u);

  const avatarWardrobeFalsePositive = setVisionValidator.normalizeStoryboardSetVisionValidation({
    status: "block",
    confidence: 0.95,
    violations: [1, 2, 3].map((segmentIndex) => ({
      segment_index: segmentIndex,
      panels: [1, 2, 3, 4, 5],
      code: "wardrobe_mismatch",
      severity: "error",
      evidence: "The black short-sleeve tee differs from the light-colored top in the avatar reference.",
    })),
    repair_instructions: ["restore the avatar outfit"],
  });
  assert.equal(avatarWardrobeFalsePositive.status, "pass", "avatar clothing must not block cross-storyboard QA");
  assert.deepEqual(setVisionValidator.getStoryboardSetRepairSegments(avatarWardrobeFalsePositive), []);

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
