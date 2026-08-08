import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-output-contract-"));
const compiled = join(output, "compiled");
const require = createRequire(import.meta.url);

try {
  writeFileSync(join(output, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "es2022",
      module: "commonjs",
      moduleResolution: "node",
      rootDir: join(ui, "src"),
      outDir: compiled,
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      types: ["node"],
      typeRoots: [join(ui, "node_modules/@types")],
    },
    files: [
      join(ui, "src/lib/server/omni/omni-segment-output-contract.ts"),
      join(ui, "src/lib/server/omni/omni-segment-retry.ts"),
      join(ui, "src/lib/server/omni/omni-product-reference-images.ts"),
    ],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", join(output, "tsconfig.json")], {
    cwd: ui,
    stdio: "inherit",
  });

  const contract = require(findFile(compiled, "omni-segment-output-contract.js"));
  const retry = require(findFile(compiled, "omni-segment-retry.js"));
  const product = require(findFile(compiled, "omni-product-reference-images.js"));

  assert.equal(contract.compareOmniSegmentTranscript("Семь привычек", "7 привычек").status, "pass");
  assert.equal(contract.compareOmniSegmentTranscript("", "").status, "pass");
  assert.equal(
    contract.compareOmniSegmentTranscript("Это работает каждый день", "В смысле это работает каждый день").status,
    "block"
  );

  const visual = contract.normalizeOmniSegmentVisualValidation({
    status: "pass",
    score: 95,
    confidence: 0.96,
    issues: [],
  }, "test-model");
  assert.equal(contract.combineOmniSegmentOutputValidation({
    visual,
    transcript: contract.compareOmniSegmentTranscript("Точный текст", "Точный текст"),
  }).status, "pass");
  assert.equal(contract.normalizeOmniSegmentVisualValidation({
    status: "pass",
    score: 90,
    confidence: 0.9,
    issues: [{ code: "wrong avatar", severity: "critical", message: "Wrong person", evidence: "frame 1" }],
  }, "test-model").status, "block");

  const snapshot = {
    product_refs: [
      { kind: "image", role: "product_secondary", url: "https://example.com/foam.jpg" },
      { kind: "image", role: "product_primary", is_primary: true, url: "https://example.com/canonical.jpg" },
    ],
  };
  assert.deepEqual(product.resolveProductIdentityReferenceImageUrls(snapshot), ["https://example.com/canonical.jpg"]);
  assert.deepEqual(product.resolveProductIdentityReferenceImageUrls({
    product_refs: [{ kind: "image", role: "product_secondary", url: "https://example.com/fallback.jpg" }],
  }), ["https://example.com/fallback.jpg"]);

  const repairPrompt = retry.appendOmniSegmentRetryPrompt("BASE", {
    omni_retry_reason: "WRONG_AVATAR",
  });
  assert.match(repairPrompt, /WRONG_AVATAR/u);
  assert.match(repairPrompt, /exact voiceover/u);

  console.log("Omni segment output contract checks passed");
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
