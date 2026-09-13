import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";

const root = resolve(import.meta.dirname, "..");
const require = createRequire(resolve(root, "ui/package.json"));
const ts = require("typescript");
function load(relativePath, mocks, environment = {}) {
  const path = resolve(root, relativePath);
  const source = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports, console, process: { env: environment },
    require(name) {
      if (!(name in mocks)) throw new Error(`Unexpected dependency ${name}`);
      return mocks[name];
    },
  }, { filename: path });
  return exports;
}
const providers = load("ui/src/lib/omni/provider.ts", {});
let authorized = true;
const reservations = [];
const route = load("ui/src/app/api/automation/final-videos/manual-run/route.ts", {
  "next/server": { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
  "@/lib/omni/provider": providers,
  "@/lib/server/telegram-auth": { getTelegramSessionUserFromRequest: async () => authorized ? {} : null },
  "@/lib/server/omni/omni-automation-settings": { getOmniAutomationSettings: async () => ({ daily_reel_limit: 4 }) },
  "@/lib/server/omni/omni-automation-queue": {
    reserveOmniAutomationJobs: async (input) => { reservations.push(input); return { jobs: [{ id: 1 }], stopped: false }; },
  },
});
const request = (body) => ({ json: async () => body });
authorized = false;
assert.equal((await route.POST(request({ projectId: 7, provider: "kie-ai" }))).status, 401);
authorized = true;
assert.equal((await route.POST(request({ clientId: 7, provider: "kie-ai" }))).status, 400);
assert.equal((await route.POST(request({ projectId: 7.5, provider: "kie-ai" }))).status, 400);
assert.equal((await route.POST(request({ projectId: 7, provider: "other" }))).status, 400);
assert.equal((await route.POST(request({ projectId: 7, productId: -1, provider: "kie-ai" }))).status, 400);
assert.equal(reservations.length, 0);
const result = await route.POST(request({ projectId: 7, productId: 12, provider: "kie-ai" }));
assert.equal(result.status, 200);
assert.equal(result.body.queuedCount, 1);
assert.deepEqual(JSON.parse(JSON.stringify(reservations[0])), {
  projectId: 7, productId: 12, provider: "kie-ai", count: 4, maxBacklogPerProject: 4,
});

const queued = [];
const scheduler = load("ui/src/lib/server/omni/omni-automation-scheduler.ts", {
  "@/lib/db": { __esModule: true, default: {
    connect: async () => ({ query: async () => ({ rows: [{ locked: true }] }), release() {} }),
    query: async () => ({ rows: [{ project_id: 7, automation_provider: "kie-ai" }, { project_id: 8, automation_provider: null }] }),
  } },
  "@/lib/omni/provider": providers,
  "./schema": { ensureOmniSchema: async () => {} },
  "./omni-automation-queue": { reserveOmniAutomationJobs: async (input) => { queued.push(input); return { jobs: [{}], stopped: false }; } },
}, { OMNI_AUTOMATION_PROVIDER: "cometapi" });
assert.equal((await scheduler.runOmniAutomationSchedulerCycle()).queued, 2);
assert.equal(queued[0].provider, "kie-ai");
assert.equal(queued[1].provider, "cometapi");
assert.ok(queued.every((input) => input.requireAutomationEnabled));

const writes = [];
const automationSettings = load("ui/src/lib/server/omni/omni-automation-settings.ts", {
  "@/lib/db": { __esModule: true, default: { query: async (sql, values) => {
    if (sql.startsWith("UPDATE")) writes.push(values);
    return { rows: [{ auto_generate_reels: false, automation_provider: "cometapi", daily_reel_limit: 3, project_reel_limit: 30, project_job_count: 0 }] };
  } } },
  "@/lib/omni/provider": providers,
  "./schema": { ensureOmniSchema: async () => {} },
});
await assert.rejects(automationSettings.updateOmniAutomationSettings({ projectId: 7, provider: "bad" }));
assert.equal(writes.length, 0);
await automationSettings.updateOmniAutomationSettings({ projectId: 7, provider: "kie-ai", autoGenerateReels: true });
assert.equal(writes[0][1], true);
assert.equal(writes[0][7], "kie-ai");
await automationSettings.updateOmniAutomationSettings({ projectId: 7, dailyReelLimit: 5 });
assert.equal(writes[1][7], null);

execFileSync("python3", ["-c", "from services.v1.automation.final_video_scheduler import run_scheduler_cycle; assert run_scheduler_cycle() == 0"], { cwd: root });
console.log("Omni entrypoints: auth, project/product validation, provider persistence, shared queue, retired legacy scheduler passed");
