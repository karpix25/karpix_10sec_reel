import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-product-broll-"));
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
      join(ui, "src/lib/server/omni/omni-product-broll-contract.ts"),
      join(ui, "src/lib/server/omni/physical-scene-model.ts"),
      join(ui, "src/lib/server/omni/physical-scene-validator.ts"),
      join(ui, "src/lib/server/omni/physical-storyboard-normalizer.ts"),
    ],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", config], { cwd: ui, stdio: "inherit" });

  const broll = require(findFile(compiled, "omni-product-broll-contract.js"));
  const model = require(findFile(compiled, "physical-scene-model.js"));
  const validator = require(findFile(compiled, "physical-scene-validator.js"));
  const normalizer = require(findFile(compiled, "physical-storyboard-normalizer.js"));

  assert.match(broll.buildProductBrollAction("Крем"), /без людей и рук/iu);
  assert.match(broll.buildProductBrollPlacement("Крем"), /устойчивой поверхности/iu);
  assert.doesNotMatch(broll.buildProductBrollAction("Крем"), /держит|берет|рука подходит/iu);

  const normalized = normalizer.normalizePhysicalStoryboardSegment({
    storyboard: {
      segmentIndex: 1,
      durationSeconds: 4,
      voiceoverText: "Показываю крем сегодня",
      frames: [{
        spokenText: "Показываю крем сегодня",
        visualAction: "герой держит Крем в одной руке",
        camera: "средний план героя",
        environment: "светлая комната",
        wardrobe: "темная футболка",
        productPlacement: "Крем в руке",
        sfxNotes: "тихая речь",
        effectNotes: null,
        modelMusicNotes: null,
      }],
    },
    productName: "Крем",
    productVisible: true,
    productRole: "background_prop",
  });
  const frame = normalized.frames[0];
  assert.match(frame.visualAction, /самостоятельная предметная B-roll/iu);
  assert.match(frame.productPlacement, /без людей, рук и взаимодействия/iu);
  assert.match(frame.camera, /без людей и рук/iu);
  assert.equal(frame.speechMode, "voiceover_only");

  const repaired = model.repairReferenceAction({
    action: "герой показывает чужую банку",
    spokenText: "Показываю Крем",
    productName: "Крем",
    productVisible: true,
  });
  assert.match(repaired, /самостоятельная предметная B-roll/iu);

  const validation = validator.validatePhysicalScene({
    storyboard: normalized,
    creativePlan: { productRole: "background_prop", beats: [] },
    productName: "Крем",
  });
  assert.equal(validation.valid, true, JSON.stringify(validation));
  const invalid = validator.validatePhysicalScene({
    storyboard: {
      ...normalized,
      frames: [{ ...frame, visualAction: "герой показывает Крем в руке", productPlacement: "Крем стоит на столе" }],
    },
    creativePlan: { productRole: "background_prop", beats: [] },
    productName: "Крем",
  });
  assert.ok(invalid.errors.includes("frame_1_product_broll_has_human_interaction"));
  console.log("Omni product B-roll contract checks passed");
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
  throw new Error(`File ${fileName} not found`);
}
