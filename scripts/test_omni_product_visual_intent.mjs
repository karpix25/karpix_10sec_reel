import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readdirSync, rmSync, mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-product-visual-intent-"));
const compiled = join(output, "compiled");
const config = join(output, "tsconfig.json");
const require = createRequire(import.meta.url);

try {
  writeFileSync(config, JSON.stringify({
    compilerOptions: {
      target: "es2022",
      module: "commonjs",
      moduleResolution: "node",
      baseUrl: ui,
      paths: { "@/*": ["src/*"] },
      rootDir: join(ui, "src"),
      outDir: compiled,
      strict: true,
      skipLibCheck: true,
    },
    files: [
      join(ui, "src/lib/server/omni/omni-product-visual-intent.ts"),
      join(ui, "src/lib/server/omni/physical-scene-model.ts"),
      join(ui, "src/lib/server/omni/reference-segment-plan.ts"),
      join(ui, "src/lib/server/omni/llm-prompt-chain-storyboard-validator.ts"),
      join(ui, "src/lib/audio-library/moods.ts"),
    ],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", config], { cwd: ui, stdio: "inherit" });

  const moods = findFile(compiled, "moods.js");
  const aliasMoods = join(output, "node_modules", "@", "lib", "audio-library", "moods.js");
  mkdirSync(join(output, "node_modules", "@", "lib", "audio-library"), { recursive: true });
  copyFileSync(moods, aliasMoods);

  const intent = require(findFile(compiled, "omni-product-visual-intent.js"));
  const physical = require(findFile(compiled, "physical-scene-model.js"));
  const reference = require(findFile(compiled, "reference-segment-plan.js"));
  const sourceValidator = require(findFile(compiled, "llm-prompt-chain-storyboard-validator.js"));
  const plan = intent.buildOmniProductVisualIntent({
    voiceoverText: "Вот Хлорофилл для ежедневного приема. Он остается рядом пока я объясняю пользу. Потом возвращаемся к режиму сна и отдыху сегодня.",
    durationSeconds: 10,
    productName: "Хлорофилл",
    productRole: "brief_demo",
  });

  assert.deepEqual(plan.visibleByFrame, [true, true, true, true, true]);
  assert.equal(plan.firstVisibleFrame, 1);
  assert.equal(plan.lastVisibleFrame, 5);
  assert.deepEqual(
    physical.resolveProductDemoFrame(plan.visibleByFrame, 1, 5),
    { frameIndex: 2, frameCount: 5 },
  );
  assert.deepEqual(
    physical.resolveProductDemoFrame([false, false, true, true, false], 2, 5),
    { frameIndex: 1, frameCount: 2 },
  );

  const sourcePlan = {
    segmentIndex: 1,
    durationSeconds: 2,
    beats: [{
      startSeconds: 0,
      endSeconds: 2,
      sourceStartSeconds: 10,
      sourceEndSeconds: 12,
      action: "самостоятельный атмосферный B-roll",
      camera: "крупный план окружения",
      setting: "комната",
      environment: "стол",
      lighting: "мягкий свет",
      speechMode: "voiceover_only",
      sourceRole: "environment_broll",
      visibleSubjectRole: "no_people",
    }],
  };
  const staleProductFrame = {
    index: 1,
    role: "product_cutaway",
    spokenWords: "Сон и питание важны",
    visualDescription: "продуктный крупный план",
    camera: "крупный план",
    action: "показывает продукт",
    productState: "продукт виден",
    sfx: null,
    referenceRole: "product",
  };
  const repairedFrames = reference.applyReferenceSegmentPlanToFrames(
    sourcePlan,
    [staleProductFrame],
    true,
    { productVisibleByFrame: [false] },
  );
  assert.equal(repairedFrames[0].role, "environment_cutaway");
  assert.equal(sourceValidator.validateStoryboardFrameSourceInterval({
    frame: repairedFrames[0],
    frameIndex: 0,
    frameCount: 1,
    path: "frame.0",
    plan: sourcePlan,
    productName: "Хлорофилл",
    productVisible: false,
  }).some((issue) => issue.code === "storyboard_product_cutaway_without_product_intent"), false);

  const consistencyCases = [
    { speechMode: "on_camera", expectedPresenter: true, expectedBroll: false, currentRole: "environment_cutaway", expectedRole: "face_return" },
    { speechMode: "on_camera", avatarAllowed: false, expectedPresenter: false, expectedBroll: true, currentRole: "environment_cutaway", expectedRole: "environment_cutaway" },
    { speechMode: "voiceover_only", expectedPresenter: false, expectedBroll: true, currentRole: "face_open", expectedRole: "environment_cutaway" },
  ];
  for (const testCase of consistencyCases) {
    const beat = {
      startSeconds: 0,
      endSeconds: 2,
      sourceStartSeconds: 0,
      sourceEndSeconds: 2,
      action: "тестовый source beat",
      gesture: "естественное движение",
      camera: "средний план",
      setting: "комната",
      environment: "стол",
      lighting: "мягкий свет",
      ...testCase,
    };
    assert.equal(reference.isReferencePresenterSource(beat), testCase.expectedPresenter);
    assert.equal(reference.isReferenceBrollSource(beat), testCase.expectedBroll);
    const plan = { segmentIndex: 1, durationSeconds: 2, beats: [beat] };
    const frame = {
      index: 1,
      role: testCase.currentRole,
      spokenWords: "Проверяем роли",
      visualDescription: "нейтральная тестовая сцена",
      camera: "средний план",
      action: "нейтральное действие",
      productState: "продукт вне кадра",
      sfx: null,
      referenceRole: "avatar",
    };
    const aligned = reference.applyReferenceSegmentPlanToFrames(plan, [frame], true);
    assert.equal(aligned[0].role, testCase.expectedRole);
    assert.equal(sourceValidator.validateStoryboardFrameSourceInterval({
      frame: aligned[0],
      frameIndex: 0,
      frameCount: 1,
      path: "frame.0",
      plan,
    }).length, 0);
  }

  console.log("Omni product visual intent checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function findFile(directory, filename) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      try {
        return findFile(path, filename);
      } catch {
        continue;
      }
    }
    if (entry.name === filename) return path;
  }
  throw new Error(`File ${filename} not found in ${directory}`);
}
