import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-semantic-memory-"));
const compiled = join(output, "compiled");
const require = createRequire(import.meta.url);

function findFile(directory, fileName) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      try { return findFile(path, fileName); } catch { continue; }
    }
    if (entry.name === fileName) return path;
  }
  throw new Error(`File ${fileName} not found in ${directory}`);
}

try {
  const config = join(output, "tsconfig.json");
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
    },
    files: [join(ui, "src/lib/server/omni/semantic-storyboard-memory-contract.ts")],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", config], { cwd: ui, stdio: "inherit" });

  const memory = require(findFile(compiled, "semantic-storyboard-memory-contract.js"));
  const instruction = memory.buildPositiveSemanticMemoryInstruction({ code: "product_placement_mismatch" }, "fallback");
  assert.match(instruction, /^Показывай/);
  assert.equal(memory.buildPositiveSemanticMemoryInstruction({ code: "unknown_issue" }, "fallback"), "fallback");
  assert.match(memory.renderSemanticStoryboardMemoryRules([{
    issueCode: "product_placement_mismatch",
    positiveInstruction: instruction,
    occurrenceCount: 2,
  }]), /additional positive guardrails/iu);
  assert.equal(memory.renderSemanticStoryboardMemoryRules(undefined), "");
  console.log("Omni semantic memory contract checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}
