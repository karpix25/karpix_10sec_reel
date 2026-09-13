import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";

const root = resolve(import.meta.dirname, "..");
const require = createRequire(resolve(root, "ui/package.json"));
const ts = require("typescript");
function load(relativePath, mocks) {
  const path = resolve(root, relativePath);
  const result = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    reportDiagnostics: true,
  });
  assert.equal(result.diagnostics?.length || 0, 0, `${relativePath} must transpile`);
  const exports = {};
  vm.runInNewContext(result.outputText, {
    exports, console,
    fetch() { throw new Error("Network forbidden in queue regression"); },
    require(name) {
      if (!(name in mocks)) throw new Error(`Unexpected dependency ${name}`);
      return mocks[name];
    },
  }, { filename: path });
  return exports;
}

const projects = new Map();
const jobs = new Map();
const statements = [];
const now = "2026-09-04T12:00:00Z";
function project(id, extra = {}) {
  const value = { id, auto_generate_reels: true, daily_reel_limit: 10, project_reel_limit: 30, ...extra };
  projects.set(id, value);
  return value;
}
function job(id, projectId, extra = {}) {
  const value = {
    id, project_id: projectId, product_id: 12, source_legacy_scenario_id: null,
    generated_script_id: null, reel_id: null, status: "queued", current_stage: "script",
    generation_provider: "kie-ai", attempt_count: 0, max_attempts: 3,
    lease_until: null, worker_id: null, last_error: null, scheduled_for: "2026-09-04T11:00:00Z",
    ...extra,
  };
  jobs.set(id, value);
  return value;
}
function reset() { projects.clear(); jobs.clear(); statements.length = 0; }
const rows = (...items) => ({ rows: items.map((item) => ({ ...item })) });
function stopAfterFailure(sql, failed) {
  // The fake pool checks the single-statement SQL contract; it is not a PostgreSQL integration test.
  assert.match(sql, /^WITH failed_jobs? AS \( UPDATE omni_automation_jobs /);
  assert.match(sql, /UPDATE omni_projects SET auto_generate_reels = FALSE,/);
  assert.match(sql, /automation_stopped_at = CURRENT_TIMESTAMP,/);
  assert.match(sql, /WHERE id IN \(SELECT project_id FROM failed_jobs?\) AND auto_generate_reels = TRUE/);
  const reason = sql.match(/automation_stop_reason = '([^']+)'/)?.[1];
  assert.ok(reason, "The stop must have an actionable persisted reason");
  for (const failedJob of failed) {
    const owner = projects.get(failedJob.project_id);
    if (owner.auto_generate_reels) Object.assign(owner, {
      auto_generate_reels: false, automation_stopped_at: now, automation_stop_reason: reason,
    });
  }
}
async function query(source, values = []) {
  const sql = source.replace(/\s+/g, " ").trim();
  statements.push({ sql, values });
  if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return rows();
  if (sql.startsWith("WITH failed_jobs AS")) {
    assert.match(sql, /WHERE status = 'processing' AND lease_until < CURRENT_TIMESTAMP AND attempt_count >= max_attempts RETURNING project_id/);
    const expired = [...jobs.values()].filter((item) => item.status === "processing" && item.lease_until < now && item.attempt_count >= item.max_attempts);
    stopAfterFailure(sql, expired);
    for (const item of expired) Object.assign(item, {
      status: "failed", lease_until: null, worker_id: null,
      last_error: item.last_error || "Worker lease expired after max attempts", completed_at: now,
    });
    return rows();
  }
  if (sql.startsWith("WITH failed_job AS")) {
    assert.match(sql, /WHERE id = \$1 AND status NOT IN \('completed', 'failed'\) RETURNING \*/);
    assert.match(sql, /SELECT \* FROM failed_job$/);
    const item = jobs.get(values[0]);
    const failed = item && !["completed", "failed"].includes(item.status) ? [item] : [];
    stopAfterFailure(sql, failed);
    for (const entry of failed) Object.assign(entry, { status: "failed", lease_until: null, worker_id: null, last_error: values[1], completed_at: now });
    return rows(...failed);
  }
  if (sql.startsWith("WITH candidate AS")) {
    assert.doesNotMatch(sql, /auto_generate_reels/, "Stopping fresh reservations must not cancel existing work");
    assert.match(sql, /job.attempt_count < job.max_attempts/);
    assert.match(sql, /THEN job.attempt_count ELSE job.attempt_count \+ 1 END/);
    const item = [...jobs.values()].find((entry) => entry.attempt_count < entry.max_attempts && (
      entry.status === "queued" || (entry.status === "processing" && entry.lease_until < now)
    ));
    if (!item) return rows();
    if (item.current_stage !== "sync" && !(item.status === "processing" && item.worker_id === values[1])) item.attempt_count += 1;
    Object.assign(item, { status: "processing", worker_id: values[1], lease_until: "2026-09-04T12:30:00Z" });
    return rows(item);
  }
  if (sql.startsWith("UPDATE omni_automation_jobs SET status = 'queued'")) {
    assert.match(sql, /CASE WHEN \$5 THEN GREATEST\(0, attempt_count - 1\) ELSE attempt_count END/);
    const item = jobs.get(values[0]);
    Object.assign(item, { status: "queued", current_stage: values[1] || item.current_stage, lease_until: null, worker_id: null });
    if (values[4]) item.attempt_count = Math.max(0, item.attempt_count - 1);
    return rows(item);
  }
  if (sql.startsWith("SELECT * FROM omni_automation_jobs WHERE id = $1")) return rows(jobs.get(values[0]));
  if (sql.startsWith("SELECT id, auto_generate_reels")) return rows(projects.get(values[0]));
  if (sql.startsWith("SELECT COUNT(*) FILTER")) {
    const projectJobs = [...jobs.values()].filter((item) => item.project_id === values[0]);
    const success = projectJobs.filter((item) => item.status === "completed" && item.success_verified_at).length;
    const reserved = projectJobs.filter((item) => ["queued", "processing"].includes(item.status)).length;
    return rows({ successful_today: success, successful_project: success, reserved_today: reserved, reserved_project: reserved });
  }
  if (sql.startsWith("SELECT id FROM omni_products")) return rows({ id: values[0] });
  if (sql.startsWith("INSERT INTO omni_automation_jobs")) {
    return rows(job(Math.max(...jobs.keys(), 0) + 1, values[0], { product_id: values[1], generation_provider: values[4] }));
  }
  throw new Error(`Unexpected SQL: ${sql}`);
}
const queue = load("ui/src/lib/server/omni/omni-automation-queue.ts", {
  "@/lib/db": { __esModule: true, default: { query, connect: async () => ({ query, release() {} }) } },
  "@/lib/omni/provider": load("ui/src/lib/omni/provider.ts", {}),
  "./omni-automation-limits": load("ui/src/lib/server/omni/omni-automation-limits.ts", {}),
  "./schema": { ensureOmniSchema: async () => {} },
});

project(7); project(8);
job(1, 7, { status: "processing", attempt_count: 3, worker_id: "old" });
const pending = job(2, 7);
const pendingBefore = { ...pending };
const failed = await queue.failOmniAutomationJob({ jobId: 1, errorMessage: "Provider rejected request" });
assert.equal(statements.length, 1, "Failure and project stop must use one atomic SQL statement");
assert.equal(failed.status, "failed");
assert.equal(failed.last_error, "Provider rejected request");
assert.equal(failed.attempt_count, 3);
assert.equal(projects.get(7).auto_generate_reels, false);
assert.equal(projects.get(7).automation_stopped_at, now);
assert.equal(projects.get(8).auto_generate_reels, true);
assert.deepEqual(pending, pendingBefore);
const auto = await queue.reserveOmniAutomationJobs({ projectId: 7, productId: 12, count: 1, requireAutomationEnabled: true });
assert.equal(auto.jobs.length, 0, "Scheduler cannot refill quota released by terminal failures");
const manual = await queue.reserveOmniAutomationJobs({ projectId: 7, productId: 12, count: 1, provider: "kie-ai" });
assert.equal(manual.jobs.length, 1, "An explicit manual run remains available within quota");
assert.equal(manual.jobs[0].generation_provider, "kie-ai");

project(7, { auto_generate_reels: true });
await queue.failOmniAutomationJob({ jobId: 1, errorMessage: "Duplicate failure" });
assert.equal(projects.get(7).auto_generate_reels, true, "A repeated old failure must not stop a newly enabled project");
job(4, 7, { status: "completed" });
assert.equal((await queue.failOmniAutomationJob({ jobId: 4, errorMessage: "Late failure" })).status, "completed");
assert.equal(projects.get(7).auto_generate_reels, true);
project(9, { auto_generate_reels: false, automation_stopped_at: "earlier", automation_stop_reason: "Остановлено вручную" });
job(5, 9, { status: "processing" });
await queue.failOmniAutomationJob({ jobId: 5, errorMessage: "Manual run failed" });
assert.equal(projects.get(9).automation_stop_reason, "Остановлено вручную");
assert.equal(projects.get(9).automation_stopped_at, "earlier");

reset();
project(7); project(8); project(9);
job(1, 7, { status: "processing", lease_until: "2026-09-04T11:00:00Z", attempt_count: 3 });
job(2, 8, { status: "processing", lease_until: "2026-09-04T11:00:00Z", attempt_count: 2 });
job(3, 9, { status: "processing", lease_until: "2026-09-04T13:00:00Z", attempt_count: 3 });
job(4, 7);
const claimInput = { workerId: "worker", leaseSeconds: 1800, perProjectConcurrency: 1 };
const retry = await queue.claimNextOmniAutomationJob(claimInput);
assert.equal(statements.length, 2, "Expired terminal jobs and their project stops are one query before claiming");
assert.equal(jobs.get(1).status, "failed");
assert.equal(jobs.get(1).attempt_count, 3);
assert.equal(projects.get(7).auto_generate_reels, false);
assert.equal(projects.get(8).auto_generate_reels, true);
assert.equal(projects.get(9).auto_generate_reels, true);
assert.equal(jobs.get(3).status, "processing", "A live lease is not terminal merely because attempts reached the limit");
assert.equal(retry.id, 2);
assert.equal(retry.attempt_count, 3, "The remaining retry budget still works");
const existing = await queue.claimNextOmniAutomationJob(claimInput);
assert.equal(existing.id, 4, "Existing queued work continues even while auto-generation is stopped");
assert.equal(existing.attempt_count, 1);
await queue.requeueOmniAutomationJob({ jobId: 2, stage: "sync", delaySeconds: 30, refundAttempt: true });
assert.equal(jobs.get(2).attempt_count, 2);
assert.equal(projects.get(8).auto_generate_reels, true, "A recoverable requeue does not stop automation");
const sync = await queue.claimNextOmniAutomationJob(claimInput);
assert.equal(sync.id, 2);
assert.equal(sync.attempt_count, 2, "Sync polling preserves the existing refund/attempt contract");

console.log("Omni terminal-failure budget: atomic project pause, lease exhaustion, preserved retries/pending jobs and manual runs passed");
