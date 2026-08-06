import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-physical-scene-"));
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
    },
    include: [
      join(ui, "src/lib/omni/**/*.ts"),
      join(ui, "src/lib/server/omni/physical-scene-validator.ts"),
    ],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", config], { cwd: ui, stdio: "inherit" });
  const validator = require(findFile(compiled, "physical-scene-validator.js"));

  const safe = validator.validatePhysicalScene({
    storyboard: storyboard([
      frame("Вот крем, он спокойно стоит на столе", "герой говорит в камеру", "крем на столе"),
    ]),
    creativePlan: null,
    productName: "Крем",
  });
  assert.equal(safe.valid, true);

  const biteWhileSpeaking = validator.validatePhysicalScene({
    storyboard: storyboard([
      frame("Вот мой перекус", "герой говорит в камеру и кусает морковь", "морковь в руке"),
    ]),
    creativePlan: null,
    productName: "Коллаген",
  });
  assert.ok(biteWhileSpeaking.errors.includes("frame_1_speech_during_consumption"));

  const identityMismatch = validator.validatePhysicalScene({
    storyboard: storyboard([
      frame("Показываю сыр", "герой держит морковь", "морковь в руке"),
    ]),
    creativePlan: null,
    productName: "Перекус",
  });
  assert.ok(identityMismatch.errors.includes("frame_1_object_identity_mismatch"));

  const multipleObjects = validator.validatePhysicalScene({
    storyboard: storyboard([
      frame("Показываю продукт", "герой держит перекус и коллаген", "коллаген в руке"),
    ]),
    creativePlan: null,
    productName: "Коллаген",
  });
  assert.ok(multipleObjects.errors.includes("frame_1_multiple_held_objects"));

  const voiceoverCutaway = validator.validatePhysicalScene({
    storyboard: storyboard([
      frame("Это помогает держать ритм", "короткая перебивка: герой кусает морковь", "морковь в кадре", "крупный кадр"),
    ]),
    creativePlan: null,
    productName: "Коллаген",
  });
  assert.equal(voiceoverCutaway.valid, true);

  console.log("Omni physical scene validator checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function storyboard(frames) {
  return { segmentIndex: 1, durationSeconds: 4, voiceoverText: frames.map((item) => item.spokenText).join(" "), frames };
}

function frame(spokenText, visualAction, productPlacement, camera = "средний план") {
  return { spokenText, visualAction, camera, environment: "комната", wardrobe: "одежда", productPlacement, sfxNotes: "естественный звук" };
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
