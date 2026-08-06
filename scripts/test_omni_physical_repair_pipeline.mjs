import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-physical-pipeline-"));
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
      join(ui, "src/lib/server/omni/physical-scene-validator.ts"),
      join(ui, "src/lib/server/omni/physical-scene-model.ts"),
      join(ui, "src/lib/server/omni/physical-storyboard-normalizer.ts"),
      join(ui, "src/lib/server/omni/physical-storyboard-ai-repair.ts"),
      join(ui, "src/lib/server/omni/omni-physical-repair-pipeline.ts"),
      join(ui, "src/lib/server/omni/storyboard/omni-storyboard-renderer.ts"),
      join(ui, "src/lib/server/omni/script-json-repair.ts"),
    ],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", config], { cwd: ui, stdio: "inherit" });

  const pipeline = require(findFile(compiled, "omni-physical-repair-pipeline.js"));
  const validator = require(findFile(compiled, "physical-scene-validator.js"));
  const segments = [1, 2, 3].map((segmentIndex) => {
    const storyboard = {
      segmentIndex,
      durationSeconds: 4,
      voiceoverText: "Рассказываю о составе продукта и показываю его",
      frames: [{
        spokenText: "Рассказываю о составе продукта",
        visualAction: "обе руки у лица, герой кусает морковь и ведет машину",
        camera: "средний план в движущейся машине",
        environment: "машина едет",
        wardrobe: "одежда",
        productPlacement: "держит сыр и Коллаген в руках",
        sfxNotes: "слышно жевание",
      }, {
        spokenText: "и показываю его",
        visualAction: "обе руки у лица, герой кусает морковь и ведет машину",
        camera: "средний план в движущейся машине",
        environment: "машина едет",
        wardrobe: "одежда",
        productPlacement: "держит сыр и Коллаген в руках",
        sfxNotes: "слышно жевание",
      }],
    };
    return {
      index: segmentIndex,
      role: "hook",
      prompt: "old prompt",
      referenceUrl: null,
      durationSeconds: 4,
      voiceoverText: storyboard.voiceoverText,
      storyboardPlan: storyboard,
      storyboardValidation: null,
      creativeStrategy: {},
      creativePlan: { productRole: "brief_demo", beats: [] },
      validation: validator.validatePhysicalScene({ storyboard, creativePlan: null, productName: "Коллаген" }),
    };
  });

  const repaired = await pipeline.repairOmniPromptPlanWithAi({
    promptPlan: segments,
    productName: "Коллаген",
    segmentCount: 3,
  });
  assert.equal(repaired.length, 3);
  for (const segment of repaired) {
    assert.equal(segment.validation.valid, true, JSON.stringify(segment.validation));
    assert.doesNotMatch(segment.storyboardPlan.frames[0].visualAction, /кус(?:ает|ать)|машин|обе\s+руки\s+у\s+лица/iu);
    assert.doesNotMatch(segment.storyboardPlan.frames[0].productPlacement, /сыр|несколько|два\s+предмета/iu);
    assert.match(segment.prompt, /РУКИ|продукт в одной руке/iu);
  }

  const missingValidation = await pipeline.repairOmniPromptPlanWithAi({
    promptPlan: [{ ...segments[0], validation: undefined }],
    productName: "Коллаген",
    segmentCount: 1,
  });
  assert.equal(missingValidation[0].validation.valid, true, JSON.stringify(missingValidation[0].validation));
  assert.doesNotMatch(missingValidation[0].storyboardPlan.frames[0].visualAction, /кус(?:ает|ать)|машин|обе\s+руки\s+у\s+лица/iu);

  const sippingStoryboard = {
    ...segments[0].storyboardPlan,
    frames: segments[0].storyboardPlan.frames.map((frame) => ({
      ...frame,
      visualAction: "герой отпивает коллаген из упаковки",
      productPlacement: "коллаген в одной руке",
    })),
  };
  const sippingValidation = validator.validatePhysicalScene({
    storyboard: sippingStoryboard,
    creativePlan: null,
    productName: "Коллаген",
  });
  assert.equal(sippingValidation.valid, false, JSON.stringify(sippingValidation));
  const sippingRepaired = await pipeline.repairOmniPromptPlanWithAi({
    promptPlan: [{ ...segments[0], storyboardPlan: sippingStoryboard, validation: sippingValidation }],
    productName: "Коллаген",
    segmentCount: 1,
  });
  assert.equal(sippingRepaired[0].validation.valid, true, JSON.stringify(sippingRepaired[0].validation));
  assert.doesNotMatch(sippingRepaired[0].storyboardPlan.frames[0].visualAction, /отпива|пив\w*|пь\w*/iu);
  console.log("Omni physical repair pipeline checks passed");
} finally {
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
