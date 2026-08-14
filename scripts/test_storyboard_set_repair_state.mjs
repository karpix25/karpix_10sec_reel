import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-storyboard-set-repair-"));
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
      join(ui, "src/lib/omni/storyboard/omni-storyboard-set-vision-types.ts"),
      join(ui, "src/lib/server/omni/storyboard-set-repair-state.ts"),
      join(ui, "src/lib/server/omni/storyboard-kie-submission-state.ts"),
    ],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", config], { cwd: ui, stdio: "inherit" });

  const stateModule = require(join(compiled, "lib/server/omni/storyboard-set-repair-state.js"));
  const kieModule = require(join(compiled, "lib/server/omni/storyboard-kie-submission-state.js"));
  const state = stateModule.createStoryboardSetRepairState({
    referenceSignature: "signature-v1",
    qaRound: 1,
    snapshot: [
      { segmentIndex: 3, url: "https://example.com/3.png" },
      { segmentIndex: 1, url: "https://example.com/1.png" },
      { segmentIndex: 2, url: "https://example.com/2.png" },
    ],
    targetSegments: [3, 2, 2],
    validation: validation(),
  });

  assert.deepEqual(state.snapshot.map((item) => item.segmentIndex), [1, 2, 3]);
  assert.deepEqual(state.targetSegments, [2, 3]);
  assert.deepEqual(
    [...stateModule.getStoryboardSetRepairSnapshotUrls(state, "signature-v1")],
    [[1, "https://example.com/1.png"], [2, "https://example.com/2.png"], [3, "https://example.com/3.png"]],
    "a resumed worker must restore the full QA snapshot before it polls the active target"
  );
  assert.deepEqual([...stateModule.getStoryboardSetRepairSnapshotUrls(state, "other-signature")], []);
  assert.deepEqual(stateModule.getStoryboardSetRepairProgress(state), { qaRound: 1, cursor: 0, segmentIndex: 2 });

  const restoredAfterWorkerRestart = stateModule.normalizeStoryboardSetRepairState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(stateModule.getStoryboardSetRepairProgress(restoredAfterWorkerRestart), { qaRound: 1, cursor: 0, segmentIndex: 2 });
  assert.deepEqual(kieModule.resolveVersionedStoryboardKieSubmissionAction({
    generationStatus: "generating",
    generationAttemptCount: 1,
    taskId: "kie-segment-2",
    lastAttemptAt: new Date(),
    generationError: null,
    referenceSignature: "signature-v1",
    generatorVersion: "storyboard-v18",
  }, {
    referenceSignature: "signature-v1",
    generatorVersion: "storyboard-v18",
  }), { kind: "poll", taskId: "kie-segment-2", generationAttemptCount: 1 }, "restart must poll the active task instead of submitting another paid task");

  const afterSecond = stateModule.advanceStoryboardSetRepairState(restoredAfterWorkerRestart, { qaRound: 1, cursor: 0, segmentIndex: 2 });
  assert.deepEqual(stateModule.getStoryboardSetRepairProgress(afterSecond), { qaRound: 1, cursor: 1, segmentIndex: 3 });

  const afterThird = stateModule.advanceStoryboardSetRepairState(afterSecond, { qaRound: 1, cursor: 1, segmentIndex: 3 });
  assert.equal(afterThird.status, "awaiting_qa");
  assert.equal(stateModule.getStoryboardSetRepairProgress(afterThird), null);
  assert.deepEqual(stateModule.normalizeStoryboardSetRepairState(JSON.parse(JSON.stringify(afterThird))), afterThird);
  assert.throws(
    () => stateModule.advanceStoryboardSetRepairState(state, { qaRound: 1, cursor: 1, segmentIndex: 3 }),
    /state changed/
  );
  console.log("Storyboard set repair state checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function validation() {
  return {
    schemaVersion: "storyboard_set_vision_v1",
    status: "repair",
    confidence: 0.9,
    canonicalIdentity: "same presenter",
    violations: [{ segmentIndex: 2, panels: [1], code: "wardrobe_mismatch", severity: "error", evidence: "different top" }],
    repairInstructions: ["restore the approved outfit"],
  };
}
