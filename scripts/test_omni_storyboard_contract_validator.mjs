import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-storyboard-contract-validator-"));
const compiled = join(output, "compiled");
const config = join(output, "tsconfig.json");
const require = createRequire(import.meta.url);

try {
  writeFileSync(config, JSON.stringify({
    compilerOptions: {
      target: "es2022",
      module: "commonjs",
      moduleResolution: "node",
      rootDir: join(ui, "src"),
      outDir: compiled,
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
    },
    files: [
      join(ui, "src/lib/omni/storyboard/omni-storyboard-timing.ts"),
      join(ui, "src/lib/omni/storyboard/omni-storyboard-types.ts"),
      join(ui, "src/lib/server/omni/omni-intro-product-contract.ts"),
      join(ui, "src/lib/server/omni/omni-segment-intent.ts"),
      join(ui, "src/lib/server/omni/storyboard/storyboard-contract-validator.ts"),
    ],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", config], { cwd: ui, stdio: "inherit" });
  const validator = require(findFile(compiled, "storyboard-contract-validator.js"));

  const valid = validator.validateStoryboardSegmentContract({
    storyboard: storyboard([
      frame("Эта пенка мягко очищает", "герой держит пенку в одной руке", "Пенка Geodemika в руке"),
      frame("кожу без ощущения стянутости", "герой спокойно говорит в камеру", "Пенка Geodemika стоит на той же поверхности"),
    ]),
    contract: contract("visible"),
  });
  assert.equal(valid.valid, true, JSON.stringify(valid));

  const hiddenProduct = validator.validateStoryboardSegmentContract({
    storyboard: storyboard([
      frame("Сон и питание важны", "герой спокойно говорит в камеру", "Пенка Geodemika в руке"),
      frame("для ровного тона кожи", "герой спокойно говорит в камеру", "в кадре только окружение"),
    ]),
    contract: contract("hidden"),
  });
  assert.ok(hiddenProduct.errors.includes("frame_1_product_visible_when_contract_hidden"));

  const wrongWardrobe = validator.validateStoryboardSegmentContract({
    storyboard: storyboard([
      { ...frame("Эта пенка мягко очищает", "герой держит пенку в одной руке", "Пенка Geodemika в руке"), wardrobe: "черная футболка" },
      frame("кожу без ощущения стянутости", "герой спокойно говорит в камеру", "в кадре только окружение"),
    ]),
    contract: contract("visible"),
  });
  assert.ok(wrongWardrobe.errors.includes("frame_1_wardrobe_contract_mismatch"));

  const changingWardrobe = validator.validateStoryboardSegmentContract({
    storyboard: storyboard([
      frame("Эта пенка мягко очищает", "герой в белой рубашке держит пенку", "Пенка Geodemika в руке"),
      { ...frame("кожу без ощущения стянутости", "герой в черном пиджаке показывает пенку", "Пенка Geodemika в руке"), wardrobe: "черный пиджак" },
    ]),
    contract: { ...contract("visible"), wardrobeContinuity: "changes_between_cuts" },
  });
  assert.equal(changingWardrobe.valid, true, JSON.stringify(changingWardrobe));

  const demoWithoutVoiceover = validator.validateStoryboardSegmentContract({
    storyboard: storyboard([
      frame("Сон и питание важны", "герой показывает пенку в камеру", "Пенка Geodemika в руке"),
      frame("для ровного тона кожи", "герой спокойно говорит в камеру", "в кадре только окружение"),
    ]),
    contract: contract("visible"),
  });
  assert.ok(demoWithoutVoiceover.errors.includes("product_demo_without_product_voiceover"));

  const actionWhenHidden = validator.validateStoryboardSegmentContract({
    storyboard: storyboard([
      frame("Сон и питание важны", "герой показывает пенку в камеру", "продукт вне кадра"),
      frame("для ровного тона кожи", "герой спокойно говорит в камеру", "в кадре только окружение"),
    ]),
    contract: contract("hidden"),
  });
  assert.ok(actionWhenHidden.errors.includes("frame_1_product_action_when_contract_hidden"));

  const neutralReferenceProp = validator.validateStoryboardSegmentContract({
    storyboard: storyboard([
      {
        ...frame("Сон и питание важны", "герой показывает контейнер с овощами в камеру", "в кадре контейнер с овощами"),
        referenceTransfer: removedProductTransfer(),
      },
      frame("для ровного тона кожи", "герой спокойно говорит в камеру", "в кадре только окружение"),
    ]),
    contract: contract("hidden"),
  });
  assert.equal(neutralReferenceProp.valid, true, JSON.stringify(neutralReferenceProp));

  assert.throws(
    () => validator.assertStoryboardPromptContracts([
      {
        index: 1,
        voiceoverText: "Эта пенка Geodemika мягко очищает кожу",
        storyboardPlan: storyboard([
          frame("Эта пенка Geodemika мягко", "герой держит пенку в одной руке", "Пенка Geodemika в руке"),
          frame("очищает кожу", "герой спокойно говорит в камеру", "в кадре только окружение"),
        ]),
        creativePlan: { productRole: "brief_demo" },
      },
      {
        index: 2,
        voiceoverText: "Сон и питание поддерживают результат",
        storyboardPlan: storyboard([
          frame("Сон и питание", "герой показывает пенку в камеру", "Пенка Geodemika в руке"),
          frame("поддерживают результат", "герой спокойно говорит в камеру", "в кадре только окружение"),
        ]),
        creativePlan: { productRole: "brief_demo" },
      },
    ], "Пенка Geodemika"),
    /segment_2_product_demo_without_product_voiceover/u
  );

  assert.throws(
    () => validator.assertStoryboardPromptContracts([{
      index: 1,
      voiceoverText: "Сон и питание поддерживают результат",
      storyboardPlan: storyboard([
        frame("Пенка Geodemika очищает", "герой держит пенку в одной руке", "Пенка Geodemika в руке"),
        frame("кожу мягко", "герой спокойно говорит в камеру", "в кадре только окружение"),
      ]),
      creativePlan: { productRole: "hidden" },
    }], "Пенка Geodemika"),
    /segment_1_storyboard_voiceover_mismatch/u
  );

  console.log("Omni storyboard contract validator checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function contract(productVisibility) {
  return {
    productName: "Пенка Geodemika",
    productVisibility,
    fixedWardrobe: "белый пиджак и кремовая блузка",
  };
}

function storyboard(frames) {
  return {
    segmentIndex: 1,
    durationSeconds: 4,
    voiceoverText: frames.map((frame) => frame.spokenText).join(" "),
    frames,
  };
}

function frame(spokenText, visualAction, productPlacement) {
  return {
    spokenText,
    visualAction,
    camera: "крупный план",
    environment: "светлая ванная",
    wardrobe: "белый пиджак и кремовая блузка",
    productPlacement,
    sfxNotes: "тихая комнатная атмосфера",
  };
}

function removedProductTransfer() {
  return {
    version: "reference-transfer-v3",
    productMentioned: false,
    productMeaningfulBeat: false,
    visualCue: null,
    cameraComposition: null,
    requiredSupportProps: [],
    requiredReferenceAction: null,
    decisions: {
      layout: "preserve",
      camera: "preserve",
      lighting: "preserve",
      editLanguage: "preserve",
      wardrobe: "preserve",
      environment: "preserve",
      presenterAction: "preserve",
      sourceProduct: "remove",
      sourceProps: "preserve",
      overlays: "remove",
    },
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
