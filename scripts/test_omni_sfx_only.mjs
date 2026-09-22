import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-sfx-only-"));
const require = createRequire(import.meta.url);

try {
  writeFileSync(join(output, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "es2022", module: "commonjs", moduleResolution: "node", strict: true,
      outDir: output, skipLibCheck: true,
    },
    include: [join(ui, "src/lib/omni/storyboard/omni-storyboard-contract.ts")],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", join(output, "tsconfig.json")], { cwd: ui, stdio: "inherit" });
  const contract = require(findFile(output, "omni-storyboard-contract.js"));
  const storyboard = {
    segmentIndex: 1,
    durationSeconds: 4,
    voiceoverText: "Раз два три четыре Пять шесть семь восемь",
    frames: [
      frame("Раз два три четыре", "без музыки, только речь"),
      frame("Пять шесть семь восемь", "легкая мелодия на фоне"),
    ],
  };
  const sanitized = contract.sanitizeOmniStoryboardAudio(storyboard);
  assert.deepEqual(sanitized.frames.map((item) => item.sfxNotes), [
    "естественные звуки текущей сцены",
    "естественные звуки текущей сцены",
  ]);
  assert.ok(sanitized.frames.every((item) => item.modelMusicNotes === null));
  assert.equal(contract.validateOmniStoryboardSegment(sanitized).valid, true);
  console.log("Omni SFX-only storyboard checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function frame(spokenText, sfxNotes) {
  return {
    spokenText, sfxNotes, visualAction: "естественный жест", camera: "средний план",
    environment: "комната", wardrobe: "повседневная одежда", productPlacement: "продукт вне кадра",
    effectNotes: null, modelMusicNotes: "none",
  };
}

function findFile(directory, name) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isFile() && entry.name === name) return path;
    if (entry.isDirectory()) {
      const nested = findFile(path, name);
      if (nested) return nested;
    }
  }
  return null;
}
