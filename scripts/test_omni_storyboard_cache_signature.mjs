import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-storyboard-cache-signature-"));
const require = createRequire(import.meta.url);

try {
  const config = join(output, "tsconfig.json");
  writeFileSync(config, JSON.stringify({
    compilerOptions: {
      target: "es2022",
      module: "commonjs",
      moduleResolution: "node",
      rootDir: join(ui, "src"),
      outDir: join(output, "compiled"),
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      types: ["node"],
      typeRoots: [join(ui, "node_modules/@types")],
    },
    include: [
      join(ui, "src/lib/omni/storyboard/omni-storyboard-types.ts"),
      join(ui, "src/lib/server/omni/storyboard-cache-signature.ts"),
    ],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", config], { cwd: ui, stdio: "inherit" });
  const { buildStoryboardPlanSignature } = require(findFile(join(output, "compiled"), "storyboard-cache-signature.js"));
  const base = { index: 1, storyboardPlan: { segmentIndex: 1, durationSeconds: 4, voiceoverText: "текст", frames: [{ spokenText: "текст", visualAction: "нейтральный жест", camera: "план", environment: "комната", wardrobe: "одежда", productPlacement: "продукт на столе", sfxNotes: "речь" }] } };
  const changed = { ...base, storyboardPlan: { ...base.storyboardPlan, frames: [{ ...base.storyboardPlan.frames[0], visualAction: "держит продукт в одной руке" }] } };
  assert.equal(buildStoryboardPlanSignature([base]), buildStoryboardPlanSignature([base]));
  assert.notEqual(buildStoryboardPlanSignature([base]), buildStoryboardPlanSignature([changed]));
  console.log("Omni storyboard cache signature checks passed");
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
