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
  assert.deepEqual(resolveStoryboardKieSubmissionAction(null, now), { kind: "submit", generationAttemptCount: 1 });
  assert.deepEqual(resolveStoryboardKieSubmissionAction(row({ generationStatus: "generating", taskId: "kie-1", generationAttemptCount: 1 }), now), {
    kind: "poll", taskId: "kie-1", generationAttemptCount: 1,
  });
  assert.deepEqual(resolveStoryboardKieSubmissionAction(row({ generationStatus: "submitting" }), now), { kind: "wait" });
  assert.deepEqual(resolveStoryboardKieSubmissionAction(row({ generationStatus: "submitting", lastAttemptAt: new Date(now - STORYBOARD_KIE_SUBMISSION_STALE_MS) }), now), { kind: "stalled" });
  assert.deepEqual(resolveStoryboardKieSubmissionAction(row({ generationStatus: "generating", taskId: null }), now), { kind: "stalled" });
  assert.deepEqual(resolveStoryboardKieSubmissionAction(row({ generationStatus: "failed", generationAttemptCount: 2 }), now), {
    kind: "submit", generationAttemptCount: 3,
  });
  assert.deepEqual(resolveStoryboardKieSubmissionAction(row({ generationStatus: "failed", generationAttemptCount: 3 }), now), {
    kind: "exhausted", generationAttemptCount: 3,
  });
  assert.deepEqual(resolveVersionedStoryboardKieSubmissionAction(versionedRow({ generationAttemptCount: 3 }), {
    referenceSignature: "current", generatorVersion: "v10",
  }, now), { kind: "submit", generationAttemptCount: 1 });
  assert.deepEqual(resolveVersionedStoryboardKieSubmissionAction(versionedRow({ generationStatus: "generating", taskId: "old-task" }), {
    referenceSignature: "current", generatorVersion: "v10",
  }, now), { kind: "poll", taskId: "old-task", generationAttemptCount: 1 });
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
