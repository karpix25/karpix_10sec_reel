import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-reference-format-mode-"));
const compiled = join(output, "compiled");
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
  const config = join(output, "tsconfig.json");
  writeFileSync(config, JSON.stringify({
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
    files: [join(ui, "src/lib/server/omni/omni-reference-format-mode.ts")],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", config], { cwd: ui, stdio: "inherit" });

  const mode = require(findFile(compiled, "omni-reference-format-mode.js"));
  assert.equal(mode.normalizeReferenceFormatMode("voice-over montage"), "voiceover_montage");
  assert.equal(mode.resolveReferenceFormatMode({ reference_format_mode: "continuous_story" }), "continuous_story");
  assert.equal(mode.resolveReferenceFormatMode({
    clothing: { adaptation_notes: "multiple outfits across the video" },
    location_timeline: [{}, {}],
    camera_timeline: [{}, {}, {}],
  }), "voiceover_montage");
  assert.equal(mode.resolveReferenceFormatMode({ location_timeline: [{}, {}] }), "continuous_story");
  assert.match(mode.renderReferenceFormatContract("voiceover_montage"), /independent cutaways/iu);
  console.log("Omni reference format mode checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}
