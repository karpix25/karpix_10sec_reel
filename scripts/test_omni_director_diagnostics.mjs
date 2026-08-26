import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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

const productionShapedPlan = {
  format: "talking_head_cutaways",
  title: "Тест",
  total_voiceover: "Раз два три четыре пять шесть",
  segments: [{
    index: 1,
    duration_seconds: 10,
    voiceover: "Раз два три четыре пять шесть",
    storyboard_frames: Array.from({ length: 5 }, (_, index) => ({
      index: index + 1,
      role: "hook",
      spoken_words: "Раз два три",
      visual_description: "конкретная наблюдаемая сцена",
      camera: "средний план",
      action: "персонаж смотрит в камеру",
      product_state: "вне кадра",
      sfx: "звук комнаты",
      reference_role: "avatar",
    })),
  }],
};
const productionFailure = diagnostics.diagnoseDirectorSegmenterOutput({
  attempt: 1,
  model: "google/gemini-2.5-flash",
  content: JSON.stringify(productionShapedPlan),
  parsed: productionShapedPlan,
  status: "schema_invalid",
});
assert.equal(productionFailure.segmentDiagnostics[0].validFrameCount, 0);
assert.deepEqual(
  productionFailure.segmentDiagnostics[0].invalidFrames[0].missingFields,
  ["role"],
  "the production-shaped response has all frame fields but an unsupported role value",
);
assert.deepEqual(productionFailure.segmentDiagnostics[0].invalidFrames[0].invalidValues, { role: "hook" });
assert.match(diagnostics.formatDirectorSegmenterDiagnostic(productionFailure), /no_valid_storyboard_frames.*missing=role invalid=role="hook"/u);

const promptSource = readFileSync(join(ui, "src/lib/server/omni/llm-prompt-chain-prompts.ts"), "utf8");
assert.match(promptSource, /source_role и storyboard_frames\[\]\.role — разные поля/u);
assert.match(promptSource, /Разрешены ровно face_open, product_cutaway, environment_cutaway и face_return/u);
assert.match(promptSource, /Никогда не копируй значения source_role в storyboard_frames\[\]\.role/u);
console.log("director diagnostics smoke: ok");
