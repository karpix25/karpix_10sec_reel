import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-semantic-repair-"));
const compiled = join(output, "compiled");
const require = createRequire(import.meta.url);
const originalFetch = global.fetch;
const originalKey = process.env.OPENROUTER_API_KEY;
let lastScenario;

try {
  writeFileSync(join(output, "tsconfig.json"), JSON.stringify({
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
      join(ui, "src/lib/omni/**/*.ts"),
      join(ui, "src/lib/server/omni/omni-storyboard-semantic-repair.ts"),
      join(ui, "src/lib/server/omni/storyboard-semantic-repair-state.ts"),
    ],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", join(output, "tsconfig.json")], { cwd: ui, stdio: "inherit" });
  mirrorAlias("lib");
  const pgStub = join(output, "node_modules", "pg");
  mkdirSync(pgStub, { recursive: true });
  writeFileSync(join(pgStub, "index.js"), "class Pool { async query() { return { rows: [] }; } } module.exports = { Pool };\n");

  const { prepareOmniPromptPlanWithSemanticRepair } = require(findFile(compiled, "omni-storyboard-semantic-repair.js"));
  process.env.OPENROUTER_API_KEY = "test-key";

  const success = await runScenario(prepareOmniPromptPlanWithSemanticRepair, { changedVoiceover: false, suffix: "success" });
  assert.equal(success.result[0].durationSeconds, 4);
  assert.equal(success.result[0].storyboardPlan.frames.length, 2);
  assert.equal(success.result[0].voiceoverText, "Это тестовая реплика для нового ролика");
  assert.equal(success.result[0].storyboardPlan.frames[0].visualAction, "Полная пересборка: герой спокойно смотрит в объектив");
  assert.equal(success.calls, 7, "bounded success path must use exactly 7 LLM calls");
  assert.equal(success.fullRebuildCalls, 1, "full rebuild must run once");
  assert.equal(success.finalReviewCalls, 1, "successful rebuild must receive one final review");

  await assert.rejects(
    runScenario(prepareOmniPromptPlanWithSemanticRepair, { changedVoiceover: true, suffix: "fingerprint" }),
    /Storyboard semantic repair exhausted.*source voiceover words/iu,
  );
  const guard = lastScenario;
  assert.equal(guard.calls, 6, "voiceover guard must stop before a second rebuild or final review");
  assert.equal(guard.fullRebuildCalls, 1);
  assert.equal(guard.finalReviewCalls, 0);

  console.log("Omni storyboard semantic repair checks passed");
} finally {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalKey;
  rmSync(output, { recursive: true, force: true });
}

async function runScenario(prepare, options) {
  let calls = 0;
  let reviewCalls = 0;
  let fullRebuildCalls = 0;
  let finalReviewCalls = 0;
  const promptPlan = [buildPromptPlan(options.suffix)];
  const input = {
    projectId: 1,
    productId: 1,
    promptPlan,
    script: "Это тестовая реплика для нового ролика",
    productName: "Тестовый продукт",
    productDescription: null,
    productPhysicalContract: null,
    directorBrief: null,
    referenceSceneMode: "presenter",
    referenceFormatMode: "continuous_story",
    model: `test/${options.suffix}`,
  };

  global.fetch = async (_url, init) => {
    calls += 1;
    const body = JSON.parse(String(init.body));
    const systemPrompt = body.messages[0].content;
    if (systemPrompt.includes("строгий режиссерский редактор")) {
      reviewCalls += 1;
      const passed = reviewCalls === 4;
      if (passed) finalReviewCalls += 1;
      return response({ choices: [{ message: { content: JSON.stringify({
        passed,
        issues: passed ? [] : [{ segmentIndex: 1, code: "meaning", explanation: "Нужна более точная визуальная развязка" }],
        repairInstructions: passed ? [] : ["пересобери финальный визуальный акцент"],
      }) } }] });
    }
    if (systemPrompt.includes("полностью пересобираешь")) {
      fullRebuildCalls += 1;
      return response({ choices: [{ message: { content: JSON.stringify({
        segments: [{
          index: 1,
          voiceoverText: options.changedVoiceover ? "Другая реплика" : "Это тестовая реплика для нового ролика",
          storyboardPlan: storyboard(options.changedVoiceover ? "Другая реплика" : undefined, "Полная пересборка: герой спокойно смотрит в объектив"),
        }],
      }) } }] });
    }
    return response({ choices: [{ message: { content: JSON.stringify({
      segments: [{ index: 1, storyboardPlan: storyboard(undefined, `Локальная правка ${calls}`) }],
    }) } }] });
  };

  try {
    const result = await prepare(input);
    lastScenario = { calls, fullRebuildCalls, finalReviewCalls };
    return { result, calls, fullRebuildCalls, finalReviewCalls };
  } catch (error) {
    lastScenario = { calls, fullRebuildCalls, finalReviewCalls };
    throw error;
  }
}

function buildPromptPlan(suffix) {
  return {
    index: 1,
    role: "hook",
    prompt: `Исходный prompt ${suffix}`,
    referenceUrl: null,
    durationSeconds: 4,
    voiceoverText: "Это тестовая реплика для нового ролика",
    storyboardPlan: storyboard(),
    storyboardValidation: null,
    creativeStrategy: {},
    creativePlan: { productRole: "hidden", beats: [] },
    referenceSegmentPlan: null,
    validation: { valid: true, errors: [], warnings: [] },
  };
}

function storyboard(voiceoverText = "Это тестовая реплика для нового ролика", action = "Герой спокойно смотрит в камеру") {
  return {
    segmentIndex: 1,
    durationSeconds: 4,
    voiceoverText,
    frames: [
      frame("Это тестовая реплика", action),
      frame("для нового ролика", action),
    ],
  };
}

function frame(spokenText, visualAction) {
  return {
    spokenText,
    visualAction,
    camera: "средний план",
    environment: "спокойная комната",
    wardrobe: "белая рубашка",
    productPlacement: "продукт вне кадра",
    sfxNotes: "естественный звук комнаты",
  };
}

function response(body) {
  return { ok: true, json: async () => body };
}

function mirrorAlias(relativePath) {
  const source = join(compiled, relativePath);
  const target = join(output, "node_modules", "@", relativePath);
  mkdirSync(target, { recursive: true });
  cpSync(source, target, { recursive: true });
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
