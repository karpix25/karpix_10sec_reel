import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-automation-limits-"));
const require = createRequire(import.meta.url);

try {
  execFileSync(
    join(ui, "node_modules/.bin/tsc"),
    [
      "src/lib/server/omni/omni-automation-limits.ts",
      "--outDir", output,
      "--module", "commonjs",
      "--target", "es2022",
      "--skipLibCheck",
    ],
    { cwd: ui, stdio: "inherit" }
  );

  const { planOmniAutomationQueue } = require(join(output, "omni-automation-limits.js"));

  assert.deepEqual(
    planOmniAutomationQueue({
      dailyLimit: 3,
      projectLimit: 30,
      dailyJobCount: 0,
      projectJobCount: 0,
      openJobs: 0,
      maxBatchPerProject: 2,
      maxBacklogPerProject: 3,
    }),
    {
      toEnqueue: 2,
      shouldStop: false,
      shouldStopAfterQueue: false,
      remainingToday: 3,
      remainingProject: 30,
      backlogRoom: 3,
    }
  );

  assert.equal(planOmniAutomationQueue(base({ dailyJobCount: 3 })).toEnqueue, 0);
  assert.equal(planOmniAutomationQueue(base({ dailyJobCount: 3 })).shouldStop, false);
  assert.equal(planOmniAutomationQueue(base({ projectJobCount: 30 })).toEnqueue, 0);
  assert.equal(planOmniAutomationQueue(base({ projectJobCount: 30 })).shouldStop, true);
  assert.equal(planOmniAutomationQueue(base({ openJobs: 3 })).toEnqueue, 0);
  assert.equal(planOmniAutomationQueue(base({ dailyJobCount: 2, maxBatchPerProject: 3 })).toEnqueue, 1);
  assert.equal(planOmniAutomationQueue(base({ projectJobCount: 29, maxBatchPerProject: 3 })).toEnqueue, 1);
  assert.equal(planOmniAutomationQueue(base({ projectJobCount: 29, maxBatchPerProject: 3 })).shouldStopAfterQueue, true);
  assert.equal(planOmniAutomationQueue(base({ dailyLimit: 0 })).toEnqueue, 0);
  assert.equal(planOmniAutomationQueue(base({ projectLimit: 0 })).toEnqueue, 0);

  console.log("Omni automation limit checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function base(overrides = {}) {
  return {
    dailyLimit: 3,
    projectLimit: 30,
    dailyJobCount: 0,
    projectJobCount: 0,
    openJobs: 0,
    maxBatchPerProject: 1,
    maxBacklogPerProject: 3,
    ...overrides,
  };
}
