import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire, Module } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-llm-chain-"));
const require = createRequire(import.meta.url);
const technicalMontageTerms = /punch[ -]?in|jump cut|match cut|speed ramp|object wipe|split[ -]?screen|freeze frame|j[ -]?cut|l[ -]?cut/iu;
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
      join(ui, "src/lib/server/omni/omni-script-length-guard.ts"),
      join(ui, "src/lib/server/omni/llm-prompt-chain-number-words.ts"),
      join(ui, "src/lib/server/omni/llm-prompt-chain-storyboard-validator.ts"),
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
  const creativeRepair = require(findFile(output, "llm-prompt-chain-creative-repair.js"));
  const qualityContract = require(findFile(output, "script-quality-contract.js"));
  const preflight = require(findFile(output, "creative-script-preflight.js"));
  assert.ok(runner.runLlmPromptChain, "runner smoke import must expose runLlmPromptChain");
  assert.equal(numberWords.spellPromptChainNumbersInText("Диапазон 200-300 рублей"), "Диапазон от двухсот до трехсот рублей");
  assert.equal(numberWords.spellPromptChainNumbersInText("Диапазон 200–300 рублей"), "Диапазон от двухсот до трехсот рублей");
  assert.equal(numberWords.spellPromptChainNumbersInText("Диапазон от 200 до 300 рублей"), "Диапазон от двухсот до трехсот рублей");
  assert.equal(
    numberWords.spellPromptChainNumbersInText("1 000, 20 000, 68 тысяч и 124 400"),
    "одна тысяча, двадцать тысяч, шестьдесят восемь тысяч и сто двадцать четыре тысячи четыреста"
  );
  assert.throws(
    () => preflight.assertPromptChainNumericRangeIntegrity("Цена от 200 до 300 рублей", "Цена двести тысяч триста рублей"),
    /схлопнул числовой диапазон 200-300/u,
    "runner must reject a collapsed numeric range before saving the draft"
  );
  assert.doesNotThrow(
    () => preflight.assertPromptChainNumericRangeIntegrity("Цена от 200 до 300 рублей", "Цена от двухсот до трехсот рублей"),
    "runner must accept a preserved spoken range"
  );
  assert.equal(
    creativeRepair.resolveCreativeCopywriterAttemptMode({ attempt: 3, maxAttempts: 3, hasRejectedScript: true }),
    "targeted_repair",
    "final copywriter attempt must repair the best rejected draft instead of discarding it"
  );
  const runnerSource = readFileSync(join(ui, "src/lib/server/omni/llm-prompt-chain-runner.ts"), "utf8");
  const semanticReviewerSource = readFileSync(join(ui, "src/lib/server/omni/script-semantic-reviewer.ts"), "utf8");
  assert.match(
    runnerSource,
    /validateStoryboard(?:DirectorPlan|ProviderPlan|ProviderAlignment)/u,
    "prompt chain must reject invalid storyboard plans before paid video generation"
  );
  const copywriterSource = readFileSync(join(ui, "src/lib/server/omni/llm-creative-copywriter.ts"), "utf8");
  assert.match(copywriterSource, /CREATIVE_COPYWRITER_ATTEMPTS = 2/u, "one initial attempt and one repair only");
  assert.match(runnerSource, /creativeResult.segmentPlan/u, "director must receive the canonical authored speech plan");
  assert.doesNotThrow(() => qualityContract.assertCtaConclusionContract(
    "Плати по миру помогает платить за границей. Ссылка в профиле.", "link_in_profile"),
    "CTA-only ending is allowed without a manufactured conclusion");
  assert.throws(() => qualityContract.assertCtaConclusionContract(
    "Ссылка в профиле. Подробности я оставил в описании.", "link_in_profile"),
    /последний CTA должен вести по ссылке в профиле/u,
    "foreign CTA must still fail");
  const findings = require(findFile(output, "script-semantic-findings.js"));
  const context = {
    script: "Это Тунис. Плати по миру помогает платить за границей. Ссылка в профиле.",
    referenceScript: "Для отдыха подходит Тунис.", productName: "Плати по миру",
  };
  const evidence = { product: "Плати по миру", value: "помогает платить за границей",
    answer: "", answerKind: "named_fact", referenceAnswer: "подходит Тунис", expectedAnswer: "Тунис", transition: "" };
  const grounded = (defects = [], overrides = {}) => findings.normalizeGroundedSemanticReview(
    { evidence, defects, warnings: [], ...overrides }, context);
  const contradictory = grounded([{ code: "missing_answer", message: "Страна не названа" },
    { code: "unnatural_integration", message: "Рекламу можно удалить" }]);
  assert.equal(contradictory.version, "script-semantic-review-v2");
  assert.equal(contradictory.passed, true, "source-answer feedback stays advisory");
  assert.deepEqual(contradictory.warnings, ["Страна не названа", "Рекламу можно удалить"], "source and subjective feedback stay advisory");
  const reinterpretedReference = findings.normalizeGroundedSemanticReview({ evidence, defects: [{ code: "missing_answer", message: "Страна не названа" }], warnings: [] },
    { ...context, script: context.script.replace("Это Тунис.", "Это страна для отдыха.") });
  assert.equal(reinterpretedReference.passed, true, "reference facts guide a new script but never block it by exact wording");
  const unsupported = grounded([{ code: "unsupported_product_claim", scriptQuote: "помогает платить за границей", expectedText: "платить за границей",
    message: "Описание не подтверждает это свойство. Придумай скидку." }]);
  assert.equal(unsupported.passed, false, "grounded unsupported capability must block");
  assert.ok(unsupported.repairInstructions.every((line) => !line.includes("Придумай скидку")),
    "model-suggested benefits must not leak into repair instructions");
  assert.throws(() => grounded([{ code: "unsupported_product_claim", scriptQuote: "снимает наличные", expectedText: "наличные",
    message: "Неподтвержденное свойство" }]), /точную цитату/u, "invented quotes must fail closed");
  assert.match(semanticReviewerSource, /normalizeGroundedSemanticReview/u);
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
        duration_seconds: 8,
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
  assert.equal(normalizedProvider.segmentPrompts[0].durationSeconds, 8);
  assert.equal(normalizedProvider.segmentPrompts[0].referenceRole, "avatar");
  assert.equal(normalizedProvider.segmentPrompts[0].storyboardFrames.length, 4);
  assert.equal(numberWords.formatPromptChainRange(60, 72), "от шестидесяти до семидесяти двух");
  assert.ok(!/[\d-]/u.test(numberWords.formatPromptChainRange(60, 72)));
  assert.equal(
    numberWords.spellPromptChainNumbersInText("Билет 68 тысяч, залог 7, итого 124 400 рублей"),
    "Билет шестьдесят восемь тысяч, залог семь, итого сто двадцать четыре тысячи четыреста рублей"
  );

  const repairedFrameCount = normalizer.lockDirectorPlanSpeech(
    {
      ...directorPlan,
      segments: [{
        ...directorPlan.segments[0],
        storyboardFrames: directorPlan.segments[0].storyboardFrames.slice(0, 2),
      }],
    },
    [{ text: directorPlan.segments[0].voiceover }],
    [directorPlan.segments[0].durationSeconds],
    directorPlan.format,
  );
  assert.equal(repairedFrameCount.segments[0].storyboardFrames.length, 4);
  assert.equal(
    repairedFrameCount.segments[0].storyboardFrames.map((frame) => frame.spokenWords).join(" "),
    directorPlan.segments[0].voiceover,
  );
  assertIssue(
    storyboardValidator.validateStoryboardDirectorPlan({
      ...directorPlan,
      segments: [{ ...directorPlan.segments[0], storyboardFrames: directorPlan.segments[0].storyboardFrames.slice(0, 3) }],
    }),
    "storyboard_frame_count"
  );
  assertIssue(
    storyboardValidator.validateStoryboardDirectorPlan({
      ...directorPlan,
      segments: [{
        ...directorPlan.segments[0],
        storyboardFrames: directorPlan.segments[0].storyboardFrames.map((frame, index) => index === 1
          ? {
              ...frame,
              visualDescription: "Миша касается лица обеими руками",
              action: "Миша держит продукт в одной руке и касается лица обеими руками",
              productState: "продукт в одной руке",
            }
          : frame),
      }],
    }),
    "storyboard_hand_object_conflict"
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
    storyboardValidator.validateStoryboardDirectorPlan({
      ...directorPlan,
      segments: [
        {
          ...directorPlan.segments[0],
          storyboardFrames: directorPlan.segments[0].storyboardFrames.map((frame, index) => index === 1
            ? { ...frame, role: "environment_cutaway", action: "Миша смотрит в камеру и улыбается" }
            : frame),
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
          storyboardFrames: directorPlan.segments[0].storyboardFrames.map((frame, index) => index === 0
            ? { ...frame, productState: "аэрогриль на столе, Миша держит его в руках" }
            : frame),
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
    "prompt_missing_storyboard_speech_instruction"
  );
  assertIssue(
    validator.validateProviderPromptPlan({
      ...providerPlan,
      segmentPrompts: [{
        ...providerPlan.segmentPrompts[0],
        prompt: `${providerPlan.segmentPrompts[0].prompt} ${providerPlan.segmentPrompts[0].voiceover}`,
      }],
    }),
    "prompt_voiceover_leak"
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
          durationSeconds: 8,
          voiceover: "Второй сегмент звучит отдельно.",
          storyboardFrames: [],
          referenceRole: "avatar",
          prompt: "Миша возвращается к лицу и читает только реплики из раскадровки. Natural SFX, без музыки.",
        },
      ],
    }),
    "neighbor_voiceover_leak"
  );

  const promptChainSource = readFileSync(
    join(ui, "src/lib/server/omni/llm-prompt-chain-prompts.ts"),
    "utf8"
  );
  assert.ok(promptChainSource.includes("Reference transcript:"), "original remains source material");
  assert.ok(promptChainSource.includes("Сделай новый разговорный сценарий на тему и в подаче reference"), "rewrite starts from the original topic and delivery");
  assert.ok(promptChainSource.includes("Не меняй названия, места, цены и другие измеримые факты reference"), "specific reference facts must survive the rewrite");
  assert.match(promptChainSource, /renderReferenceFactContract/u, "writer receives an explicit source fact card");
  assert.ok(promptChainSource.includes("Верни только JSON с массивом segments"), "author returns executable speech groups");
  assert.ok(promptChainSource.includes("Не уходи в несвязанную тему"), "product must stay connected to the source topic");
  assert.ok(promptChainSource.includes("Чужие рекламные обещания из оригинала не являются фактами"));
  assert.ok(promptChainSource.includes("прямо раскрывает смысл spoken_words"));
  assert.ok(promptChainSource.includes("Product_cutaway всегда отдельный B-roll без людей, рук"),
    "product cutaways forbid avatar/product interaction");
  assert.ok(promptChainSource.includes("артикул или подробности можно найти в описании"));
  assert.ok(promptChainSource.includes("десять секунд это пять кадров"));
  assert.ok(promptChainSource.includes("позу, взгляд и жест выбирай под текущую реплику"));
  assert.doesNotMatch(promptChainSource, technicalMontageTerms);

  console.log("LLM prompt chain contract checks passed!");
} finally {
  rmSync(output, { recursive: true, force: true });
}
function requireRunnerWithStubs(runnerPath) {
  const originalLoad = Module._load;
  Module._load = function loadWithPromptChainStubs(request, parent, isMain) {
    if (request === "./llm-prompt-chain-types") return originalLoad.apply(this, arguments);
    if (request === "./llm-prompt-chain-number-words") return originalLoad.apply(this, arguments);
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
    totalVoiceover: "Устал от долгой готовки? Этот аэрогриль делает ужин проще и быстрее прямо дома уже сегодня вечером.",
    segments: [
      {
        index: 1,
        durationSeconds: 8,
        voiceover: "Устал от долгой готовки? Этот аэрогриль делает ужин проще и быстрее прямо дома уже сегодня вечером.",
        productState: "товар вне кадра",
        storyboardFrames,
        shots: [
          { role: "face_open", action: "Миша говорит в камеру энергично" },
          { role: "cutaway", action: "короткая перебивка на жест свободной руки" },
          { role: "face_return", action: "Миша возвращается к лицу и заканчивает мысль" },
        ],
        endState: "Миша смотрит в камеру с пустыми руками",
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
        durationSeconds: 8,
        voiceover: "Устал от долгой готовки? Этот аэрогриль делает ужин проще и быстрее прямо дома уже сегодня вечером.",
        storyboardFrames,
        referenceRole: "avatar",
        prompt:
          "Вертикальное живое видео. Читать только реплики из раскадровки на русском языке. Не показывать панели раскадровки. Natural SFX, без музыки.",
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
      productState: "товар вне кадра",
      sfx: "легкий комнатный шум",
      referenceRole: "avatar",
    },
    {
      index: 2,
      role: "environment_cutaway",
      spokenWords: "Этот аэрогриль делает ужин",
      visualDescription: "живая перебивка на свободный жест руки в светлой кухне",
      camera: "средний план жеста и детали окружения",
      action: "камера мягко следует за жестом руки",
      productState: "товар вне кадра",
      sfx: "тихий комнатный шум",
      referenceRole: "avatar",
    },
    {
      index: 3,
      role: "environment_cutaway",
      spokenWords: "проще и быстрее прямо",
      visualDescription: "видна аккуратная рабочая зона без лишней грязи",
      camera: "детальный боковой план окружения",
      action: "свет мягко меняется на кухонной поверхности",
      productState: "товар вне кадра",
      sfx: "мягкий бытовой гул",
      referenceRole: "avatar",
    },
    {
      index: 4,
      role: "face_return",
      spokenWords: "дома уже сегодня вечером.",
      visualDescription: "Миша возвращается к лицу и уверенно завершает мысль",
      camera: "крупный портретный план без резкого движения",
      action: "Миша коротко кивает в камеру",
      productState: "товар вне кадра",
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
