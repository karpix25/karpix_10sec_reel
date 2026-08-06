import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-physical-storyboard-repair-"));
const compiled = join(output, "compiled");
const config = join(output, "tsconfig.json");
const require = createRequire(import.meta.url);
const originalFetch = global.fetch;
const originalKey = process.env.OPENROUTER_API_KEY;

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
      types: ["node"],
      typeRoots: [join(ui, "node_modules/@types")],
    },
    include: [
      join(ui, "src/lib/omni/storyboard/omni-storyboard-types.ts"),
      join(ui, "src/lib/server/omni/script-json-repair.ts"),
      join(ui, "src/lib/server/omni/physical-storyboard-ai-repair.ts"),
    ],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", config], { cwd: ui, stdio: "inherit" });

  const { repairPhysicalStoryboardSegment } = require(findFile(compiled, "physical-storyboard-ai-repair.js"));
  const segment = sampleSegment();
  process.env.OPENROUTER_API_KEY = "test-key";
  let calls = 0;
  let request;
  global.fetch = async (_url, init) => {
    calls += 1;
    request = JSON.parse(String(init.body));
    return response({
      model: "test/repair-model",
      choices: [{ message: { content: JSON.stringify({ frames: [{ frameIndex: 2, visualAction: "Герой спокойно говорит и держит Коллаген в одной руке", productPlacement: "Коллаген в одной руке" }] }) } }],
    });
  };

  const repaired = await repairPhysicalStoryboardSegment({
    segment,
    productName: "Коллаген",
    validationErrors: ["frame_2_speech_during_consumption"],
    model: "test/repair-model",
  });
  assert.equal(calls, 1);
  assert.equal(request.response_format.type, "json_object");
  assert.match(request.messages[1].content, /frame_2_speech_during_consumption/);
  assert.equal(repaired.error, null);
  assert.equal(repaired.patch.frames[0].frameIndex, 2);
  assert.equal(repaired.patch.frames[0].productPlacement, "Коллаген в одной руке");
  assert.equal("spokenText" in repaired.patch.frames[0], false);

  calls = 0;
  global.fetch = async () => {
    calls += 1;
    return response({
      choices: [{
        message: { content: JSON.stringify({ frames: [{ frameIndex: 1, spokenText: "нельзя менять речь" }] }) },
      }],
    });
  };
  const invalid = await repairPhysicalStoryboardSegment({ segment, productName: "Коллаген", validationErrors: [] });
  assert.equal(calls, 1);
  assert.deepEqual(invalid.patch, { frames: [] });
  assert.match(invalid.error, /non-visual field|invalid patch/i);

  calls = 0;
  global.fetch = async () => {
    calls += 1;
    return { ok: false, status: 503, text: async () => "temporary failure" };
  };
  const failed = await repairPhysicalStoryboardSegment({ segment, productName: "Коллаген", validationErrors: [] });
  assert.equal(calls, 1);
  assert.deepEqual(failed.patch, { frames: [] });
  assert.match(failed.error, /503/);

  delete process.env.OPENROUTER_API_KEY;
  calls = 0;
  global.fetch = async () => {
    calls += 1;
    return response({});
  };
  const noKey = await repairPhysicalStoryboardSegment({ segment, productName: "Коллаген", validationErrors: [] });
  assert.equal(calls, 0);
  assert.deepEqual(noKey.patch, { frames: [] });
  assert.match(noKey.error, /OPENROUTER_API_KEY/);
  console.log("Physical storyboard AI repair checks passed");
} finally {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalKey;
  rmSync(output, { recursive: true, force: true });
}

function sampleSegment() {
  return {
    segmentIndex: 1,
    durationSeconds: 4,
    voiceoverText: "Это безопасная реплика для теста",
    frames: [{
      spokenText: "Это безопасная реплика",
      visualAction: "Герой смотрит в камеру",
      camera: "средний план",
      environment: "комната",
      wardrobe: "белая рубашка",
      productPlacement: "продукт вне кадра",
      sfxNotes: "естественный звук комнаты",
    }, {
      spokenText: "для теста",
      visualAction: "Герой пробует продукт",
      camera: "средний план",
      environment: "комната",
      wardrobe: "белая рубашка",
      productPlacement: "продукт в руке",
      sfxNotes: "естественный звук комнаты",
    }],
  };
}

function response(body) {
  return { ok: true, json: async () => body };
}

function findFile(dir, fileName) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      try { return findFile(path, fileName); } catch { continue; }
    }
    if (entry.name === fileName) return path;
  }
  throw new Error(`Could not find ${fileName}`);
}
