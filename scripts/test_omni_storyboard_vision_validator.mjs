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
      join(ui, "src/lib/server/omni/storyboard-vision-validator.ts"),
      join(ui, "src/lib/server/omni/omni-storyboard-image-prompt.ts"),
      join(ui, "src/lib/server/omni/storyboard/omni-reference-action-transfer.ts"),
      join(ui, "src/lib/server/omni/script-json-repair.ts"),
    ],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", config], { cwd: ui, stdio: "inherit" });
  const validator = require(findFile(compiled, "storyboard-vision-contract.js"));
  const vision = require(findFile(compiled, "storyboard-vision-validator.js"));
  const imagePromptBuilder = require(findFile(compiled, "omni-storyboard-image-prompt.js"));
  const actionTransfer = require(findFile(compiled, "omni-reference-action-transfer.js"));

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

  assert.match(vision.STORYBOARD_VISION_SYSTEM_PROMPT, /semantic relevance/iu);
  assert.match(vision.STORYBOARD_VISION_SYSTEM_PROMPT, /tripod/iu);
  assert.match(vision.STORYBOARD_VISION_SYSTEM_PROMPT, /numbered reveal/iu);
  const expectedStoryboard = buildStoryboard();
  const visionPrompt = vision.buildStoryboardVisionPrompt(expectedStoryboard, "Коллаген");
  assert.match(visionPrompt, /environment/iu);
  assert.match(visionPrompt, /Reject literal source-reference objects/iu);

  const styleOnlyAction = actionTransfer.selectStoryboardReferenceAction({
    brief: buildDirectorBrief("Black-gloved hand drops tomato salsa over couscous", "holds a food bowl"),
    policy: { mode: "style_only", omitRawDirectorGuidance: true },
    productName: "Коллаген",
    productVisible: true,
    segmentIndex: 1,
    segmentCount: 1,
    frameIndex: 1,
    frameCount: 1,
  });
  assert.equal(styleOnlyAction, "");

  const adaptedPackageAction = actionTransfer.selectStoryboardReferenceAction({
    brief: buildDirectorBrief("Presenter holds a white product box", "shows the package"),
    policy: { mode: "full_reference", omitRawDirectorGuidance: false },
    productName: "Geodemika Enzyme Cleansing Foam",
    productVisible: true,
    segmentIndex: 1,
    segmentCount: 1,
    frameIndex: 1,
    frameCount: 1,
  });
  assert.match(adaptedPackageAction, /Geodemika Enzyme Cleansing Foam/iu);
  assert.doesNotMatch(adaptedPackageAction, /white product box/iu);
  const adaptedNumberedCard = actionTransfer.selectStoryboardReferenceAction({
    brief: buildDirectorBrief("Full-screen product card for principle 1", ""),
    policy: { mode: "full_reference", omitRawDirectorGuidance: false },
    productName: "Geodemika Enzyme Cleansing Foam",
    productVisible: true,
    segmentIndex: 1,
    segmentCount: 1,
    frameIndex: 1,
    frameCount: 1,
  });
  assert.match(adaptedNumberedCard, /полноэкранная продуктовая перебивка/iu);
  assert.match(adaptedNumberedCard, /структурным номером/iu);

  const imagePrompt = imagePromptBuilder.buildStoryboardImagePrompt({
    segmentIndex: 1,
    storyboard: expectedStoryboard,
    productName: "Коллаген",
    avatarReferenceUrl: "https://example.com/avatar.jpg",
    productReferenceUrls: ["https://example.com/product.jpg"],
    directorReferenceImageUrls: ["https://example.com/reference.jpg"],
  });
  assert.match(imagePrompt, /Сохраняй функцию вирусной механики/iu);
  assert.match(imagePrompt, /Действия и предметы бери только из описания/iu);
  assert.doesNotMatch(imagePrompt, /источник PIP, ракурса, света, фона, одежды, действий/iu);
  const styleOnlyImagePrompt = imagePromptBuilder.buildStoryboardImagePrompt({
    segmentIndex: 1,
    storyboard: expectedStoryboard,
    productName: "Коллаген",
    avatarReferenceUrl: "https://example.com/avatar.jpg",
    productReferenceUrls: ["https://example.com/product.jpg"],
    directorReferenceImageUrls: ["https://example.com/reference.jpg"],
    referencePolicy: { mode: "style_only", omitRawDirectorGuidance: true },
  });
  assert.match(styleOnlyImagePrompt, /Не копируй действия, предметы, еду, упаковки/iu);
  assert.doesNotMatch(styleOnlyImagePrompt, /главный источник PIP/iu);

  console.log("Omni storyboard vision validator checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function buildStoryboard() {
  return {
    segmentIndex: 1,
    durationSeconds: 4,
    voiceoverText: "Коллаген помогает поддерживать кожу каждый день",
    frames: [1, 2].map((index) => ({
      spokenText: index === 1 ? "Коллаген помогает поддерживать" : "кожу каждый день",
      visualAction: index === 1 ? "герой держит Коллаген" : "структурный номер пункта",
      camera: "medium close-up",
      environment: "warm kitchen light",
      wardrobe: "beige sweater",
      productPlacement: "Коллаген в одной руке",
      sfxNotes: "естественный звук речи",
      effectNotes: index === 2 ? "hard cut" : null,
      modelMusicNotes: null,
      physicalPlan: null,
    })),
  };
}

function buildDirectorBrief(actionDescription, actorGesture) {
  return {
    action_beats: [{ timestamp_sec: 0, action_description: actionDescription, actor_gesture: actorGesture }],
  };
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
