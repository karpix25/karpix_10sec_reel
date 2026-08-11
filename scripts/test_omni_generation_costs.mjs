import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-generation-costs-"));
const compiled = join(output, "compiled");
const config = join(output, "tsconfig.json");
const require = createRequire(import.meta.url);

try {
  writeFileSync(config, JSON.stringify({
    compilerOptions: {
      target: "es2022",
      module: "commonjs",
      moduleResolution: "node",
      rootDir: join(ui, "src"),
      outDir: compiled,
      strict: true,
      skipLibCheck: true,
    },
    include: [join(ui, "src/lib/omni/generation-cost.ts")],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", config], { cwd: ui, stdio: "inherit" });
  const costs = require(findFile(compiled, "generation-cost.js"));
  const summary = costs.summarizeOmniGenerationCosts({
    openRouterUsd: 0.012,
    openRouterCostIsEstimated: false,
    events: [
      { taskId: "image-1", operation: "storyboard", status: "completed", creditsConsumed: 20, costUsd: 0.2, costIsEstimated: true },
      { taskId: "image-2", operation: "storyboard", status: "completed", creditsConsumed: 20, costUsd: 0.2, costIsEstimated: true },
      { taskId: "video-1", operation: "video", status: "processing", creditsConsumed: null, costUsd: null, costIsEstimated: true },
      { taskId: "video-2", operation: "video", status: "completed", creditsConsumed: 126, costUsd: 1.26, costIsEstimated: true },
    ],
  });

  assert.ok(Math.abs((summary.totalUsd || 0) - 1.672) < 1e-9);
  assert.equal(summary.kieCredits, 166);
  assert.equal(summary.storyboard.attempts, 2);
  assert.equal(summary.video.attempts, 2);
  assert.equal(summary.pendingKieTasks, 1);
  assert.equal(summary.totalIsEstimated, true);
  console.log("Omni generation cost checks passed");
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
