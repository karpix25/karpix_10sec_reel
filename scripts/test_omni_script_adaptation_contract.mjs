import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-script-adaptation-"));
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
  execFileSync(
    join(ui, "node_modules/.bin/tsc"),
    [
      join(ui, "src/lib/server/omni/script-adaptation-contract.ts"),
      "--outDir", output,
      "--module", "commonjs",
      "--target", "es2022",
      "--skipLibCheck",
    ],
    { cwd: ui, stdio: "inherit" },
  );

  const { normalizeScriptAdaptationPlan, renderScriptAdaptationContract } = require(
    findFile(output, "script-adaptation-contract.js"),
  );

  const formatTransfer = normalizeScriptAdaptationPlan({
    mode: "format_transfer",
    reason: "Reference teaches a WiFi lookup mechanic while the product solves payments abroad.",
    preserve: ["personal discovery hook", "step by step reveal"],
    replace: ["WiFi password mechanism", "source subject"],
    product_bridge: "Move from travel friction to a concrete way to pay abroad.",
    confidence: 0.96,
  });
  assert.ok(formatTransfer);
  assert.equal(formatTransfer.mode, "format_transfer");
  assert.match(renderScriptAdaptationContract(formatTransfer), /не пытайся отвечать на исходный предметный вопрос/iu);

  const preserve = normalizeScriptAdaptationPlan({
    mode: "preserve_reference",
    reason: "Reference and product address the same payment problem abroad.",
    preserve: ["payment problem", "practical solution"],
    replace: ["foreign brand"],
    product_bridge: "The product is the direct solution to the payment problem.",
  });
  assert.ok(preserve);
  assert.equal(preserve.mode, "preserve_reference");

  const adjacent = normalizeScriptAdaptationPlan({
    mode: "adjacent_bridge",
    reason: "Reference is a travel checklist and the product is a neighboring travel preparation need.",
    preserve: ["checklist structure", "travel context"],
    replace: ["unrelated checklist item"],
    product_bridge: "Add payment preparation as the next useful travel step.",
  });
  assert.ok(adjacent);
  assert.equal(adjacent.mode, "adjacent_bridge");

  console.log("Omni script adaptation contract checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}
