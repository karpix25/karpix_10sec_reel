import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-preflight-idempotency-"));
const compiled = join(output, "compiled");
const config = join(output, "tsconfig.json");
const require = createRequire(import.meta.url);

try {
  writeFileSync(config, JSON.stringify({
    compilerOptions: {
      target: "es2022", module: "commonjs", moduleResolution: "node",
      baseUrl: join(ui, "src"), paths: { "@/*": ["*"] }, rootDir: join(ui, "src"), outDir: compiled,
      strict: true, esModuleInterop: true, skipLibCheck: true, types: ["node"],
      typeRoots: [join(ui, "node_modules/@types")],
    },
    include: [
      join(ui, "src/lib/omni/**/*.ts"),
      join(ui, "src/lib/server/omni/physical-scene-model.ts"),
      join(ui, "src/lib/server/omni/omni-reference-transfer-policy.ts"),
      join(ui, "src/lib/server/omni/physical-scene-validator.ts"),
      join(ui, "src/lib/server/omni/physical-storyboard-normalizer.ts"),
    ],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", config], { cwd: ui, stdio: "inherit" });

  const validator = require(findFile(compiled, "physical-scene-validator.js"));
  const normalizer = require(findFile(compiled, "physical-storyboard-normalizer.js"));
  const source = {
    frames: [{
      spokenText: "Это полезная привычка каждый день",
      visualAction: "героиня энергично говорит в камеру и жестикулирует",
      camera: "средний ручной план",
      environment: "салон автомобиля днем",
      wardrobe: "черная футболка",
      productPlacement: "в кадре тематические объекты и окружение текущей реплики; продукт вне кадра",
      sfxNotes: "тихие звуки машины и живая речь",
      referenceTransfer: {
        version: "reference-transfer-v6", productMentioned: false, productMeaningfulBeat: false,
        visualCue: null, cameraComposition: "средний ручной план", requiredSupportProps: ["пакет с едой"],
        requiredReferenceAction: "показывает пакет с едой", decisions: {
          layout: "keep", camera: "keep", lighting: "keep", editLanguage: "keep", wardrobe: "keep",
          environment: "keep", presenterAction: "adapt", sourceProduct: "remove", sourceProps: "keep", overlays: "remove",
        },
      },
    }],
  };
  const input = { segmentIndex: 1, durationSeconds: 4, voiceoverText: "Это полезная привычка каждый день", productName: "Хлорофилл" };
  const firstSource = validator.normalizeStoryboardSource({ source, ...input });
  const first = normalizer.normalizePhysicalStoryboardSegment({ storyboard: firstSource, productName: input.productName, productVisible: false });
  const secondSource = validator.normalizeStoryboardSource({ source: first, ...input });
  const second = normalizer.normalizePhysicalStoryboardSegment({ storyboard: secondSource, productName: input.productName, productVisible: false });

  assert.deepEqual(second, first, "the physical preflight must be idempotent");
  assert.equal(first.frames[0].referenceTransfer.requiredReferenceAction, "показывает пакет с едой");
  const prompt = normalizer.applyCanonicalStoryboardOverrides("base prompt", first);
  assert.equal(normalizer.applyCanonicalStoryboardOverrides(prompt, first), prompt);
  assert.equal(prompt.split(normalizer.CANONICAL_STORYBOARD_OVERRIDES_HEADER).length - 1, 1);
  console.log("Omni physical preflight idempotency checks passed");
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
