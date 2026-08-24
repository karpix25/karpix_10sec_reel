import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-storyboard-semantic-state-"));
const require = createRequire(import.meta.url);

try {
  writeFileSync(join(output, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "es2022",
      module: "commonjs",
      moduleResolution: "node",
      outDir: join(output, "compiled"),
      strict: true,
      skipLibCheck: true,
      types: ["node"],
      typeRoots: [join(ui, "node_modules/@types")],
    },
    files: [join(ui, "src/lib/server/omni/storyboard-semantic-repair-state.ts")],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", join(output, "tsconfig.json")], { cwd: ui, stdio: "inherit" });

  const stateModule = require(join(output, "compiled/storyboard-semantic-repair-state.js"));
  const plan = [{ index: 1, durationSeconds: 4, voiceoverText: "тест", storyboardPlan: { frames: [{ camera: "a", visualAction: "b" }] } }];
  assert.equal(stateModule.fingerprintStoryboardPlan(plan), stateModule.fingerprintStoryboardPlan([{ ...plan[0], storyboardPlan: { frames: [{ visualAction: "b", camera: "a" }] } }]));
  assert.notEqual(stateModule.fingerprintStoryboardPlan(plan), stateModule.fingerprintStoryboardPlan([{ ...plan[0], durationSeconds: 6 }]));

  const state = stateModule.createStoryboardSemanticRepairState();
  stateModule.recordLocalSemanticRepair(state);
  stateModule.recordLocalSemanticRepair(state);
  const fingerprint = stateModule.fingerprintStoryboardPlan(plan);
  assert.equal(stateModule.beginFullSemanticRebuild(state, fingerprint), true);
  assert.equal(stateModule.beginFullSemanticRebuild(state, fingerprint), false);
  stateModule.beginFinalSemanticReview(state);
  assert.equal(state.phase, "final_review");
  for (let index = 0; index < stateModule.MAX_SEMANTIC_REPAIR_LLM_CALLS; index += 1) stateModule.consumeSemanticRepairLlmCall(state);
  assert.throws(() => stateModule.consumeSemanticRepairLlmCall(state), /call budget/);
  console.log("Storyboard semantic repair state checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}
