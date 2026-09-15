import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-dash-normalization-"));
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
      types: ["node"],
      typeRoots: [join(ui, "node_modules/@types")],
    },
    files: [join(ui, "src/lib/server/omni/omni-script-text-contract.ts")],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", join(output, "tsconfig.json")], { cwd: ui, stdio: "inherit" });
  const contract = require(findFile(join(output, "compiled"), "omni-script-text-contract.js"));

  assert.equal(contract.sanitizeOmniScriptText("Состав — без сложностей"), "Состав, без сложностей");
  assert.equal(contract.sanitizeOmniScriptText("face-to-camera"), "face to camera");
  assert.equal(contract.sanitizeOmniScriptText("ИИ-конструктор сайтов"), "ИИ конструктор сайтов");
  assert.doesNotMatch(contract.sanitizeOmniScriptText("Текст — без дефисов"), /[-‐‑‒–—―−]/u);
  console.log("Omni dash normalization checks passed");
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
  throw new Error(`File ${fileName} not found`);
}
