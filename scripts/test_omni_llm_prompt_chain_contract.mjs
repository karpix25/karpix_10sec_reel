import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire, Module } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-llm-chain-"));
const require = createRequire(import.meta.url);

function findFile(base, filename) {
  const queue = [base];
  while (queue.length > 0) {
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
  const tsconfigPath = join(output, "tsconfig.json");
  const globalsPath = join(output, "globals.d.ts");
  writeFileSync(globalsPath, "declare const process: { env: Record<string, string | undefined> };\n");
  writeFileSync(tsconfigPath, JSON.stringify({
    compilerOptions: {
      outDir: join(output, "compiled"),
      module: "commonjs",
      target: "es2022",
      baseUrl: ui,
      paths: { "@/*": ["src/*"] },
      skipLibCheck: true,
      esModuleInterop: true,
      moduleResolution: "node",
    },
    files: [
      globalsPath,
      join(ui, "src/lib/server/omni/provider-prompt-contract-validator.ts"),
      join(ui, "src/lib/server/omni/llm-prompt-chain-normalizer.ts"),
      join(ui, "src/lib/server/omni/llm-prompt-chain-runner.ts"),
      join(ui, "src/lib/server/omni/llm-prompt-chain-number-words.ts"),
    ],
  }));

  execFileSync(
    join(ui, "node_modules/.bin/tsc"),
    ["--project", tsconfigPath],
    { cwd: ui, stdio: "inherit" }
  );

  const validator = require(findFile(output, "provider-prompt-contract-validator.js"));
  const storyboardValidator = require(findFile(output, "llm-prompt-chain-storyboard-validator.js"));
  const normalizer = require(findFile(output, "llm-prompt-chain-normalizer.js"));
  const runner = requireRunnerWithStubs(findFile(output, "llm-prompt-chain-runner.js"));
  const numberWords = require(findFile(output, "llm-prompt-chain-number-words.js"));
  assert.ok(runner.runLlmPromptChain, "runner smoke import must expose runLlmPromptChain");

  const directorPlan = makeDirectorPlan();
  const providerPlan = makeProviderPlan();

  assert.deepEqual(validator.validateDirectorSegmentPlan(directorPlan), []);
  assert.deepEqual(validator.validateProviderPromptPlan(providerPlan), []);
  assert.deepEqual(storyboardValidator.validateStoryboardDirectorPlan(directorPlan), []);
  assert.deepEqual(storyboardValidator.validateStoryboardProviderPlan(providerPlan), []);
  assert.deepEqual(storyboardValidator.validateStoryboardProviderAlignment(directorPlan, providerPlan), []);

  const normalizedProvider = normalizer.normalizeProviderPromptPlan({
    segment_prompts: [
      {
        index: 1,
        duration_seconds: 10,
        voiceover: providerPlan.segmentPrompts[0].voiceover,
        storyboard_frames: providerPlan.segmentPrompts[0].storyboardFrames.map((frame) => ({
          index: frame.index,
          role: frame.role,
          spoken_words: frame.spokenWords,
          visual_description: frame.visualDescription,
          camera: frame.camera,
          action: frame.action,
          product_state: frame.productState,
          sfx: frame.sfx,
          reference_role: frame.referenceRole,
        })),
        reference_role: "avatar",
        prompt: providerPlan.segmentPrompts[0].prompt,
      },
    ],
  });
  assert.equal(normalizedProvider.segmentPrompts[0].durationSeconds, 10);
  assert.equal(normalizedProvider.segmentPrompts[0].referenceRole, "avatar");
  assert.equal(normalizedProvider.segmentPrompts[0].storyboardFrames.length, 5);
  assert.equal(numberWords.formatPromptChainRange(60, 72), "от шестидесяти до семидесяти двух");
  assert.ok(!/[\d-]/u.test(numberWords.formatPromptChainRange(60, 72)));

  assertIssue(
    storyboardValidator.validateStoryboardDirectorPlan({
      ...directorPlan,
      segments: [{ ...directorPlan.segments[0], storyboardFrames: directorPlan.segments[0].storyboardFrames.slice(0, 4) }],
    }),
    "storyboard_frame_count"
  );

  assertIssue(
    storyboardValidator.validateStoryboardDirectorPlan({
      ...directorPlan,
      segments: [{
        ...directorPlan.segments[0],
        storyboardFrames: [
          { ...directorPlan.segments[0].storyboardFrames[0], spokenWords: "Слишком много слов в одном кадре" },
          ...directorPlan.segments[0].storyboardFrames.slice(1),
        ],
      }],
    }),
    "storyboard_spoken_word_count"
  );

  assertIssue(
    storyboardValidator.validateStoryboardProviderAlignment(directorPlan, {
      ...providerPlan,
      segmentPrompts: [{
        ...providerPlan.segmentPrompts[0],
        voiceover: "Устал от долгой готовки? Этот аэрогриль делает ужин проще.",
      }],
    }),
    "voiceover_mismatch"
  );

  assertIssue(
    storyboardValidator.validateStoryboardProviderPlan({
      ...providerPlan,
      segmentPrompts: [{
        ...providerPlan.segmentPrompts[0],
        prompt: providerPlan.segmentPrompts[0].prompt.replace("без музыки", "естественные звуки"),
      }],
    }),
    "missing_no_music_instruction"
  );

  assertIssue(
    validator.validateDirectorSegmentPlan({
      ...directorPlan,
      segments: [
        {
          ...directorPlan.segments[0],
          shots: [
            directorPlan.segments[0].shots[0],
            { role: "cutaway", action: "Миша смотрит в камеру и улыбается" },
            directorPlan.segments[0].shots[2],
          ],
        },
      ],
    }),
    "cutaway_faces_camera"
  );

  assertIssue(
    validator.validateDirectorSegmentPlan({
      ...directorPlan,
      segments: [
        {
          ...directorPlan.segments[0],
          productState: "аэрогриль на столе, Миша держит его в руках",
        },
      ],
    }),
    "product_state_conflict"
  );

  assertIssue(
    validator.validateProviderPromptPlan({
      ...providerPlan,
      segmentPrompts: [
        {
          ...providerPlan.segmentPrompts[0],
          prompt: "Аэрогриль стоит на столе без рук, затем рука берет его и поворачивает.",
        },
      ],
    }),
    "hands_conflict"
  );

  assertIssue(
    validator.validateDirectorSegmentPlan({
      ...directorPlan,
      segments: [{ ...directorPlan.segments[0], voiceover: "С этим аэрогрилем вы сможете" }],
    }),
    "bad_speech_boundary"
  );

  assertIssue(
    validator.validateProviderPromptPlan({
      ...providerPlan,
      segmentPrompts: [{ ...providerPlan.segmentPrompts[0], prompt: "Кадр 1 с улыбкой" }],
    }),
    "digit"
  );

  assertIssue(
    validator.validateProviderPromptPlan({
      ...providerPlan,
      segmentPrompts: [{ ...providerPlan.segmentPrompts[0], prompt: "Живой кадр — без паузы" }],
    }),
    "dash"
  );

  assertIssue(
    validator.validateProviderPromptPlan({
      ...providerPlan,
      segmentPrompts: [{ ...providerPlan.segmentPrompts[0], prompt: "Живой кадр 🔥" }],
    }),
    "emoji"
  );

  assertIssue(
    validator.validateProviderPromptPlan({
      ...providerPlan,
      segmentPrompts: [{ ...providerPlan.segmentPrompts[0], prompt: "Вертикальное живое видео. Миша улыбается." }],
    }),
    "prompt_voiceover_occurrence"
  );

  assertIssue(
    validator.validateProviderPromptPlan({
      ...providerPlan,
      segmentPrompts: [{
        ...providerPlan.segmentPrompts[0],
        prompt: `${providerPlan.segmentPrompts[0].prompt} Субтитры не нужны.`,
      }],
    }),
    "subtitle_overlay_cue"
  );

  assertIssue(
    validator.validateProviderPromptPlan({
      ...providerPlan,
      segmentPrompts: [{
        ...providerPlan.segmentPrompts[0],
        prompt: `${providerPlan.segmentPrompts[0].prompt} Instagram style.`,
      }],
    }),
    "platform_ui_cue"
  );

  assertIssue(
    validator.validateProviderPromptPlan({
      ...providerPlan,
      segmentPrompts: [
        {
          ...providerPlan.segmentPrompts[0],
          prompt: `${providerPlan.segmentPrompts[0].prompt} Следующая фраза: Второй сегмент звучит отдельно.`,
        },
        {
          index: 2,
          durationSeconds: 10,
          voiceover: "Второй сегмент звучит отдельно.",
          storyboardFrames: [],
          referenceRole: "avatar",
          prompt: "Миша возвращается к лицу. Речь звучит точно: Второй сегмент звучит отдельно.",
        },
      ],
    }),
    "neighbor_voiceover_leak"
  );

  console.log("LLM prompt chain contract checks passed!");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function requireRunnerWithStubs(runnerPath) {
  const originalLoad = Module._load;
  Module._load = function loadWithPromptChainStubs(request, parent, isMain) {
    if (request === "./llm-prompt-chain-types") return originalLoad.apply(this, arguments);
    if (request.startsWith("@/") || request.startsWith("./")) return {};
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require(runnerPath);
  } finally {
    Module._load = originalLoad;
  }
}

function makeDirectorPlan() {
  const storyboardFrames = makeStoryboardFrames();
  return {
    version: "llm-prompt-chain-v1",
    format: "talking_head_cutaways",
    title: "Живой тест",
    hookOptions: ["Устал от долгой готовки?", "Хочется проще?", "Готовка может быть легче"],
    selectedHook: "Устал от долгой готовки?",
    totalVoiceover: "Устал от долгой готовки? Этот аэрогриль делает ужин проще, чище и быстрее прямо на твоей кухне уже сегодня вечером.",
    segments: [
      {
        index: 1,
        durationSeconds: 10,
        voiceover: "Устал от долгой готовки? Этот аэрогриль делает ужин проще, чище и быстрее прямо на твоей кухне уже сегодня вечером.",
        productState: "аэрогриль стоит на столе без рук",
        storyboardFrames,
        shots: [
          { role: "face_open", action: "Миша говорит в камеру энергично" },
          { role: "cutaway", action: "аэрогриль стоит на столе без рук" },
          { role: "face_return", action: "Миша возвращается к лицу и заканчивает мысль" },
        ],
        endState: "Миша смотрит в камеру, аэрогриль остается на столе",
      },
    ],
    notes: "Структура держит лицо, середину и возврат.",
  };
}

function makeProviderPlan() {
  const storyboardFrames = makeStoryboardFrames();
  return {
    version: "llm-prompt-chain-v1",
    format: "talking_head_cutaways",
    segmentPrompts: [
      {
        index: 1,
        durationSeconds: 10,
        voiceover: "Устал от долгой готовки? Этот аэрогриль делает ужин проще, чище и быстрее прямо на твоей кухне уже сегодня вечером.",
        storyboardFrames,
        referenceRole: "avatar",
        prompt:
          "Вертикальное живое видео. Пять последовательных кадров примерно по две секунды. Миша начинает с лица в камеру, затем аэрогриль стоит на столе без рук, после видна аккуратная кухня, затем возврат к лицу. Речь звучит точно: Устал от долгой готовки? Этот аэрогриль делает ужин проще, чище и быстрее прямо на твоей кухне уже сегодня вечером. Natural SFX, без музыки.",
      },
    ],
    notes: "Готовый цельный prompt.",
  };
}

function makeStoryboardFrames() {
  return [
    {
      index: 1,
      role: "face_open",
      spokenWords: "Устал от долгой готовки?",
      visualDescription: "Миша в светлой кухне смотрит в камеру уверенно",
      camera: "крупный портретный план с мягким движением",
      action: "Миша начинает фразу спокойно и энергично",
      productState: "аэрогриль стоит на столе без рук",
      sfx: "легкий комнатный шум",
      referenceRole: "avatar",
    },
    {
      index: 2,
      role: "product_cutaway",
      spokenWords: "Этот аэрогриль делает ужин",
      visualDescription: "аэрогриль стоит на чистом столе рядом с овощами",
      camera: "средний предметный план без рук",
      action: "камера мягко приближается к продукту",
      productState: "аэрогриль стоит на столе без рук",
      sfx: "тихий щелчок кнопки",
      referenceRole: "product",
    },
    {
      index: 3,
      role: "product_cutaway",
      spokenWords: "проще, чище и быстрее",
      visualDescription: "видна аккуратная рабочая зона без лишней грязи",
      camera: "детальный боковой план продукта",
      action: "свет отражается на корпусе аэрогриля",
      productState: "аэрогриль стоит на столе без рук",
      sfx: "мягкий бытовой гул",
      referenceRole: "product",
    },
    {
      index: 4,
      role: "environment_cutaway",
      spokenWords: "прямо на твоей кухне",
      visualDescription: "теплая домашняя кухня с готовым ужином рядом",
      camera: "широкий спокойный план кухни",
      action: "камера показывает чистый стол и готовое блюдо",
      productState: "аэрогриль стоит на столе без рук",
      sfx: "легкий звук посуды",
      referenceRole: "none",
    },
    {
      index: 5,
      role: "face_return",
      spokenWords: "уже сегодня вечером.",
      visualDescription: "Миша возвращается к лицу и уверенно завершает мысль",
      camera: "крупный портретный план без резкого движения",
      action: "Миша коротко кивает в камеру",
      productState: "аэрогриль стоит на столе без рук",
      sfx: "естественный голос в комнате",
      referenceRole: "avatar",
    },
  ];
}

function assertIssue(issues, code) {
  assert(
    issues.some((issue) => issue.code === code),
    `Expected issue ${code}, got ${JSON.stringify(issues)}`
  );
}
