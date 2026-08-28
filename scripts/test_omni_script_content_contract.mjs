import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-writer-context-"));
const require = createRequire(import.meta.url);

function findFile(base, filename) {
  const queue = [base];
  while (queue.length) {
    const current = queue.shift();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) queue.push(fullPath);
      if (entry.isFile() && entry.name === filename) return fullPath;
    }
  }
  throw new Error(`File ${filename} not found in ${base}`);
}

try {
  execFileSync(join(ui, "node_modules/.bin/tsc"), [
    join(ui, "src/lib/server/omni/script-content-contract.ts"),
    "--outDir", output,
    "--module", "commonjs",
    "--target", "es2022",
    "--skipLibCheck",
  ], { cwd: ui, stdio: "inherit" });

  const contract = require(findFile(output, "script-content-contract.js"));
  const context = contract.buildWriterOwnedScriptContentContract(
    "Почему кожа теряет сияние? Сухой воздух вытягивает влагу, поэтому нужен регулярный уход."
  );

  assert.equal(context.adaptation.mode, "writer_owned");
  assert.match(context.adaptation.reason, /сценарист сам адаптирует смысл/iu);
  assert.equal(context.sourceMeaning.hook, "Почему кожа теряет сияние?");
  assert.ok(context.sourceMeaning.answerOrMechanism);
  assert.ok(context.sourceMeaning.conclusion);
  console.log("Omni writer-owned content context checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}
