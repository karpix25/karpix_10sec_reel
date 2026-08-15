import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-legacy-round-robin-"));
const compiled = join(output, "compiled");
const tsconfig = join(output, "tsconfig.json");
const require = createRequire(import.meta.url);

try {
  writeFileSync(tsconfig, JSON.stringify({
    compilerOptions: {
      target: "es2022",
      module: "commonjs",
      moduleResolution: "node",
      rootDir: join(ui, "src"),
      outDir: compiled,
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
    },
    include: [join(ui, "src/lib/server/omni/legacy-round-robin.ts")],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", tsconfig], { cwd: ui, stdio: "inherit" });
  const compiledModule = join(compiled, "lib/server/omni/legacy-round-robin.js");
  const { selectRoundRobinCandidate } = require(compiledModule);
  const candidates = [
    { id: 3, client_id: 36 },
    { id: 1, client_id: 35 },
    { id: 2, client_id: 35 },
  ];
  assert.equal(selectRoundRobinCandidate(candidates, null)?.id, 1);
  assert.equal(selectRoundRobinCandidate(candidates, 1)?.id, 2);
  assert.equal(selectRoundRobinCandidate(candidates, 2)?.id, 3);
  assert.equal(selectRoundRobinCandidate(candidates, 3)?.id, 1);
  assert.equal(selectRoundRobinCandidate(candidates, 1, [2])?.id, 3);
  console.log("Omni legacy round-robin checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}
