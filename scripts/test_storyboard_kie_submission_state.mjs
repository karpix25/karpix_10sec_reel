import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-storyboard-kie-submission-"));
const require = createRequire(import.meta.url);
const now = Date.parse("2026-08-13T14:00:00.000Z");

try {
  execFileSync(
    join(ui, "node_modules/.bin/tsc"),
    [
      "src/lib/server/omni/storyboard-repair-limit.ts",
      "src/lib/server/omni/storyboard-kie-submission-state.ts",
      "src/lib/server/omni/storyboard-repair-reference.ts",
      "--outDir", output,
      "--module", "commonjs",
      "--target", "es2022",
      "--skipLibCheck",
    ],
    { cwd: ui, stdio: "inherit" }
  );

  const {
    STORYBOARD_KIE_SUBMISSION_STALE_MS,
    resolveStoryboardKieSubmissionAction,
    resolveVersionedStoryboardKieSubmissionAction,
  } = require(
    join(output, "storyboard-kie-submission-state.js")
  );
  const { canReuseStoryboardRepairReference, getStoryboardRepairMode } = require(
    join(output, "storyboard-repair-reference.js")
  );
  assert.deepEqual(resolveStoryboardKieSubmissionAction(null, now), { kind: "submit", generationAttemptCount: 1 });
  assert.deepEqual(resolveStoryboardKieSubmissionAction(row({ generationStatus: "generating", taskId: "kie-1", generationAttemptCount: 1 }), now), {
    kind: "poll", taskId: "kie-1", generationAttemptCount: 1,
  });
  assert.deepEqual(resolveStoryboardKieSubmissionAction(row({ generationStatus: "submitting" }), now), { kind: "wait" });
  assert.deepEqual(resolveStoryboardKieSubmissionAction(row({ generationStatus: "submitting", lastAttemptAt: new Date(now - STORYBOARD_KIE_SUBMISSION_STALE_MS) }), now), { kind: "stalled" });
  assert.deepEqual(resolveStoryboardKieSubmissionAction(row({ generationStatus: "generating", taskId: null }), now), { kind: "stalled" });
  assert.deepEqual(resolveStoryboardKieSubmissionAction(row({ generationStatus: "failed", generationAttemptCount: 1 }), now), {
    kind: "submit", generationAttemptCount: 2,
  });
  assert.deepEqual(resolveStoryboardKieSubmissionAction(row({ generationStatus: "failed", generationAttemptCount: 2, generationError: "KIE policy blocked the source action" }), now), {
    kind: "exhausted", generationAttemptCount: 2, generationError: "KIE policy blocked the source action",
  });
  assert.deepEqual(resolveVersionedStoryboardKieSubmissionAction(versionedRow({ generationAttemptCount: 3 }), {
    referenceSignature: "current", generatorVersion: "v10",
  }, now), { kind: "submit", generationAttemptCount: 1 });
  assert.deepEqual(resolveVersionedStoryboardKieSubmissionAction(versionedRow({ generationStatus: "generating", taskId: "old-task" }), {
    referenceSignature: "current", generatorVersion: "v10",
  }, now), { kind: "poll", taskId: "old-task", generationAttemptCount: 1 });
  assert.equal(canReuseStoryboardRepairReference([
    { segmentIndex: 2, code: "product_placement_mismatch" },
  ], 2), true);
  assert.equal(canReuseStoryboardRepairReference([
    { segmentIndex: 2, code: "identity_mismatch" },
  ], 2), false);
  assert.equal(canReuseStoryboardRepairReference([
    { segmentIndex: 3, code: "wardrobe_mismatch" },
  ], 2), false, "a systemic mismatch elsewhere must not turn this card into a patch");
  assert.equal(canReuseStoryboardRepairReference([
    { segmentIndex: 2, code: "wardrobe_mismatch" },
  ], 2), false, "a wrong core garment requires a fresh card without the bad card as input");
  assert.equal(getStoryboardRepairMode([
    { segmentIndex: 2, code: "environment_mismatch" },
  ], 2), "metadata_only");
  assert.equal(getStoryboardRepairMode([
    { segmentIndex: 2, code: "product_packaging_mismatch" },
  ], 2), "patch");
  assert.equal(getStoryboardRepairMode([
    { segmentIndex: 2, code: "frame_action_mismatch" },
  ], 2), "metadata_only");
  assert.equal(getStoryboardRepairMode([
    { segmentIndex: 1, code: "product_packaging_mismatch" },
  ], 2, { propagateCanonicalRepair: true }), "fresh");
  console.log("Storyboard KIE submission state checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function row(overrides = {}) {
  return {
    generationStatus: "failed",
    generationAttemptCount: 1,
    taskId: null,
    lastAttemptAt: new Date(now),
    generationError: null,
    ...overrides,
  };
}

function versionedRow(overrides = {}) {
  return {
    ...row(),
    referenceSignature: "old",
    generatorVersion: "v9",
    ...overrides,
  };
}
