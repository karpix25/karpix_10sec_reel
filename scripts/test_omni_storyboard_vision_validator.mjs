import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-storyboard-vision-"));
const compiled = join(output, "compiled");
const config = join(output, "tsconfig.json");
const require = createRequire(import.meta.url);

try {
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
    include: [
      join(ui, "src/lib/omni/**/*.ts"),
      join(ui, "src/lib/server/omni/storyboard-vision-contract.ts"),
      join(ui, "src/lib/server/omni/script-json-repair.ts"),
    ],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", config], { cwd: ui, stdio: "inherit" });
  const validator = require(findFile(compiled, "storyboard-vision-contract.js"));

  const pass = validator.normalizeStoryboardVisionValidation({
    status: "pass",
    confidence: 0.96,
    panels: [{ panel_index: 5, status: "pass", violations: [] }],
  }, "test-model");
  assert.equal(pass.status, "pass");

  const repair = validator.normalizeStoryboardVisionValidation({
    status: "repair",
    confidence: 0.93,
    panels: [{
      panel_index: 5,
      status: "repair",
      violations: [{ code: "HAND_CAPACITY_CONFLICT", severity: "error", evidence: "one hand holds the jar" }],
    }],
    repair_instructions: ["touch one cheek"],
  });
  assert.equal(repair.status, "repair");
  assert.deepEqual(repair.repairInstructions, ["touch one cheek"]);

  const lowConfidence = validator.normalizeStoryboardVisionValidation({
    status: "pass",
    confidence: 0.42,
    panels: [{ panel_index: 1, status: "pass", violations: [] }],
  });
  assert.equal(lowConfidence.status, "block");
  assert.equal(validator.isStoryboardVisionValidationInconclusive(lowConfidence), true);

  const actionableBlock = validator.normalizeStoryboardVisionValidation({
    status: "block",
    confidence: 0.9,
    panels: [{
      panel_index: 1,
      status: "block",
      violations: [{ code: "AVATAR_IDENTITY_MISMATCH", severity: "error", evidence: "different hair and face" }],
    }],
  });
  assert.equal(validator.isStoryboardVisionValidationInconclusive(actionableBlock), false);
  assert.deepEqual(validator.getStoryboardVisionRepairInstructions(actionableBlock), [
    "Panel 1: AVATAR_IDENTITY_MISMATCH — different hair and face",
  ]);

  const numericStringConfidence = validator.normalizeStoryboardVisionValidation({
    status: "pass",
    confidence: "0.96",
    panels: [{ panel_index: 1, status: "pass", violations: [] }],
  });
  assert.equal(numericStringConfidence.status, "pass");

  const evidenceFreeRepair = validator.normalizeStoryboardVisionValidation({
    status: "block",
    confidence: 0.8,
    panels: [
      { panel_index: 1, status: "repair", violations: [] },
      { panel_index: 2, status: "repair", violations: [] },
    ],
    repair_instructions: [],
  });
  assert.equal(evidenceFreeRepair.status, "pass");

  console.log("Omni storyboard vision validator checks passed");
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
  throw new Error(`Could not find ${fileName}`);
}
