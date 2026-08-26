import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-director-diagnostics-"));
const globalsPath = join(output, "globals.d.ts");
const tsconfigPath = join(output, "tsconfig.json");
const require = createRequire(import.meta.url);

writeFileSync(globalsPath, "");
writeFileSync(tsconfigPath, JSON.stringify({
  compilerOptions: {
    outDir: join(output, "compiled"),
    module: "commonjs",
    target: "es2022",
    skipLibCheck: true,
    esModuleInterop: true,
    moduleResolution: "node",
  },
  files: [globalsPath, join(ui, "src/lib/server/omni/llm-prompt-chain-diagnostics.ts")],
}));

execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", tsconfigPath], { cwd: ui, stdio: "inherit" });

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
  throw new Error(`File ${filename} not found`);
}

const diagnostics = require(findFile(output, "llm-prompt-chain-diagnostics.js"));
const result = diagnostics.diagnoseDirectorSegmenterOutput({
  attempt: 2,
  model: "test/model",
  content: '{"segments":[{"index":1,"duration_seconds":8,"storyboard_frames":[{"index":1,"role":"face_open","spoken_words":"три слова"}]}]}',
  parsed: {
    segments: [{
      index: 1,
      duration_seconds: 8,
      storyboard_frames: [{ index: 1, role: "face_open", spoken_words: "три слова" }],
    }],
  },
  status: "schema_invalid",
});

assert.equal(result.rootType, "object");
assert.equal(result.segmentCount, 1);
assert.deepEqual(result.segmentDiagnostics[0].invalidFrames[0].missingFields, ["visual_description", "camera", "action"]);
assert.match(diagnostics.formatDirectorSegmenterDiagnostic(result), /visual_description.*camera.*action/u);
const parseFailure = diagnostics.diagnoseDirectorSegmenterOutput({
  attempt: 1,
  model: "test/model",
  content: "{broken",
  status: "parse_failed",
  error: "Failed to parse script JSON",
});
assert.equal(parseFailure.rootType, "missing");
assert.equal(parseFailure.status, "parse_failed");
console.log("director diagnostics smoke: ok");
