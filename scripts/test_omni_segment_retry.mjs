import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-segment-retry-"));
const require = createRequire(import.meta.url);

try {
  writeFileSync(join(output, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "es2022",
      module: "commonjs",
      moduleResolution: "node",
      rootDir: join(ui, "src"),
      outDir: join(output, "compiled"),
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
    },
    files: [join(ui, "src/lib/server/omni/omni-segment-retry.ts")],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", join(output, "tsconfig.json")], { cwd: ui, stdio: "inherit" });
  const retry = require(findFile(join(output, "compiled"), "omni-segment-retry.js"));
  assert.equal(retry.getOmniSegmentRetryCount(null), 0);
  assert.equal(retry.canRetryOmniSegment({ omni_retry_count: 0 }), true);
  assert.equal(retry.canRetryOmniSegment({ omni_retry_count: 1 }), false);
  assert.deepEqual(retry.buildOmniSegmentRetryPayload({ request_id: "old" }, "provider failed"), {
    request_id: "old",
    omni_retry_count: 1,
    omni_retry_reason: "provider failed",
  });
  console.log("Omni segment retry checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function findFile(dir, fileName) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      try {
        return findFile(path, fileName);
      } catch {
        continue;
      }
    }
    if (entry.name === fileName) return path;
  }
  throw new Error(`Could not find ${fileName} in ${dir}`);
}
