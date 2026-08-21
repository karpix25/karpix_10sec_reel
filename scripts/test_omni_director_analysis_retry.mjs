import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-director-retry-"));

try {
  const tsconfig = join(output, "tsconfig.json");
  writeFileSync(tsconfig, JSON.stringify({
    compilerOptions: {
      target: "es2022",
      module: "commonjs",
      moduleResolution: "node",
      strict: true,
      outDir: output,
    },
    include: [join(ui, "src/lib/server/omni/director-analysis-retry.ts")],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", tsconfig], { cwd: ui, stdio: "inherit" });
  const { isRetryableDirectorAnalysisError } = await import(join(output, "director-analysis-retry.js"));

  assert.equal(isRetryableDirectorAnalysisError("ScrapeCreators Instagram post failed: 402 Looks like you're out of credits"), true);
  assert.equal(isRetryableDirectorAnalysisError("Instagram video resolution failed. ScrapeCreators: 402; RapidAPI fallback: 503"), true);
  assert.equal(isRetryableDirectorAnalysisError("Director analysis model returned empty content"), false);
  assert.equal(isRetryableDirectorAnalysisError(null), false);
  console.log("Omni director analysis retry checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}
