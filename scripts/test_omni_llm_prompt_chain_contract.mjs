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
  const lengthGuard = require(findFile(output, "omni-script-length-guard.js"));
  const qualityContract = require(findFile(output, "script-quality-contract.js"));
  assert.ok(runner.runLlmPromptChain, "runner smoke import must expose runLlmPromptChain");
  assert.equal(numberWords.spellPromptChainNumbersInText("Диапазон 200-300 рублей"), "Диапазон от двухсот до трехсот рублей");
  assert.equal(numberWords.spellPromptChainNumbersInText("Диапазон 200–300 рублей"), "Диапазон от двухсот до трехсот рублей");
  assert.equal(numberWords.spellPromptChainNumbersInText("Диапазон от 200 до 300 рублей"), "Диапазон от двухсот до трехсот рублей");
  assert.equal(
    numberWords.spellPromptChainNumbersInText("1 000, 20 000, 68 тысяч и 124 400"),
    "одна тысяча, двадцать тысяч, шестьдесят восемь тысяч и сто двадцать четыре тысячи четыреста"
  );
  assert.throws(
    () => runner.assertPromptChainNumericRangeIntegrity("Цена от 200 до 300 рублей", "Цена двести тысяч триста рублей"),
    /схлопнул числовой диапазон 200-300/u,
    "runner must reject a collapsed numeric range before saving the draft"
  );
  assert.doesNotThrow(
    () => runner.assertPromptChainNumericRangeIntegrity("Цена от 200 до 300 рублей", "Цена от двухсот до трехсот рублей"),
    "runner must accept a preserved spoken range"
  );
  assert.equal(
    creativeRepair.resolveCreativeCopywriterAttemptMode({ attempt: 3, maxAttempts: 3, hasRejectedScript: true }),
    "targeted_repair",
    "final copywriter attempt must repair the best rejected draft instead of discarding it"
  );
  const runnerSource = readFileSync(join(ui, "src/lib/server/omni/llm-prompt-chain-runner.ts"), "utf8");
  const semanticReviewerSource = readFileSync(join(ui, "src/lib/server/omni/script-semantic-reviewer.ts"), "utf8");
  const semanticReviewer = requireSemanticReviewerWithStubs(findFile(output, "script-semantic-reviewer.js"));
  assert.match(
    runnerSource,
    /validateStoryboard(?:DirectorPlan|ProviderPlan|ProviderAlignment)/u,
    "prompt chain must reject invalid storyboard plans before paid video generation"
  );
  assert.match(
    runnerSource,
    /compactOmniScriptToWordBudget/u,
    "prompt chain must reuse the deterministic script word-budget compactor"
  );
  assert.match(
    runnerSource,
    /assertPromptChainNumericRangeIntegrity/u,
    "copywriter must reject collapsed numeric ranges before semantic review"
  );
  assert.match(
    runnerSource,
    /CREATIVE_COPYWRITER_ATTEMPTS = 2/u,
    "copywriter must retain bounded retries for semantic repair"
  );
  const compactedConclusion = lengthGuard.compactOmniScriptToWordBudget(
    "Хук обещает Лангкави. Лишняя вводная фраза здесь. Плати по миру виртуальная карта помогает платить за границей. Ссылка в профиле. Лангкави подходит для бюджетной зимовки.",
    20,
    { productName: "Плати по миру виртуальная карта" }
  );
  assert.ok(compactedConclusion.includes("Плати по миру виртуальная карта помогает платить за границей."), "word-budget compaction must preserve the product sentence");
  assert.ok(compactedConclusion.includes("Ссылка в профиле."), "word-budget compaction must preserve the CTA");
  assert.ok(compactedConclusion.endsWith("Лангкави подходит для бюджетной зимовки."), "word-budget compaction must preserve the conclusion after CTA");
  assert.throws(
    () => qualityContract.assertCtaConclusionContract("Ссылка в профиле. Путешествуйте дешево и с комфортом.", "link_in_profile"),
    /утвердительный вывод/u,
    "imperative text after CTA must fail deterministically"
  );
  assert.doesNotThrow(
    () => qualityContract.assertCtaConclusionContract("Ссылка в профиле. Тунис подходит для бюджетного морского отдыха.", "link_in_profile"),
    "declarative conclusion after CTA must pass"
  );
  assert.throws(
    () => qualityContract.assertCtaConclusionContract(
      "Плати по миру помогает платить за границей. Ссылка в профиле. Подробности о правилах я оставил в описании. Ознакомься и будь готов.",
      "link_in_profile",
    ),
    /последний CTA должен вести по ссылке в профиле/u,
    "foreign description CTA after the product CTA must fail",
  );
  assert.throws(
    () => qualityContract.assertCtaConclusionContract(
      "Плати по миру помогает платить за границей. Ссылка в профиле. Так что не слушай новости. Путешествуй.",
      "link_in_profile",
    ),
    /утвердительный вывод/u,
    "imperative conclusion with a connective must fail",
  );
  assert.ok(
    semanticReviewerSource.includes("reconcileSemanticConclusion")
      && semanticReviewerSource.includes("assertCtaConclusionContract")
      && semanticReviewerSource.includes("finalAnswerPresent: true"),
    "semantic reviewer must defer declarative CTA conclusions to the deterministic contract"
  );
  assert.ok(
    semanticReviewerSource.includes("reconcileProductCapabilities")
      && semanticReviewerSource.includes("оплату по QR")
      && semanticReviewerSource.includes("снятие или выдачу наличных")
      && semanticReviewerSource.includes("гарантированную скидку, местную цену или защиту от наценки"),
    "semantic review must reject unsupported high-risk product capabilities"
  );
  const unsupportedSavingsReview = semanticReviewer.reconcileProductCapabilities(
    passedSemanticReview(),
    "Чтобы не платить лишнее в поездках, используй Плати по миру виртуальную карту.",
    "Виртуальная карта помогает оплачивать покупки за границей.",
    null,
  );
  assert.equal(unsupportedSavingsReview.passed, false, "unsupported savings promise before the product name must be rejected");
  const unsupportedCoverageReview = semanticReviewer.reconcileProductCapabilities(
    passedSemanticReview(),
    "Для этого есть Плати по миру виртуальная карта. С ней легко оплачивать покупки и услуги в любой стране.",
    "Виртуальная карта помогает оплачивать покупки за границей.",
    null,
  );
  assert.equal(unsupportedCoverageReview.passed, false, "unsupported worldwide coverage promise must be rejected");

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
  assert.ok(promptChainSource.includes("исходную транскрибацию reference-видео"), "LLM chain copywriter must use the reference as source material");
  assert.ok(promptChainSource.includes("Не пытайся сохранить большую часть фраз дословно"), "LLM chain must prioritize meaning over phrase count");
  assert.ok(promptChainSource.includes("Меняй слова синонимами только там"), "LLM chain must only lightly synonymize reference text");
  assert.ok(promptChainSource.includes("главный тезис, вопрос или возражение, механизм"), "LLM chain must keep original argument mechanics");
  assert.ok(promptChainSource.includes("внутреннюю карту reference"), "LLM chain must require an internal reference meaning map");
  assert.ok(promptChainSource.includes("не выбрасывай механизм, конкретный пример"), "LLM chain must preserve concrete reference substance when compressing");
  assert.ok(promptChainSource.includes("Сделай минимальную редактуру"), "LLM chain must keep reference adaptation minimal");
  assert.ok(promptChainSource.includes("Сохрани только те смысловые опоры"), "LLM chain must state one priority rule for reference adaptation");
  assert.ok(promptChainSource.includes("не переноси эту роль на аватара"), "LLM chain must strip source author expert roles");
  assert.ok(
    promptChainSource.includes("Продукт не является отдельной рекламной вставкой")
      && promptChainSource.includes("может появиться в любой естественной точке"),
    "LLM chain must integrate the product at a natural point",
  );
  assert.ok(promptChainSource.includes("объясни его конкретную пользу"), "LLM chain must keep the product functional");
  assert.ok(promptChainSource.includes("Если в reference уже есть чужой продукт"), "LLM chain must replace source products with our reference only");
  assert.ok(promptChainSource.includes("Если в reference уже есть чужой продукт"), "LLM chain must handle source products safely");
  assert.ok(promptChainSource.includes("не копируй его название, бренд, упаковку и свойства"), "LLM chain must not copy source product identity");
  assert.ok(promptChainSource.includes("Сохрани его сценарную роль"), "LLM chain must preserve source product narrative role");
  assert.ok(promptChainSource.includes("После CTA продолжи или заверши исходный тезис reference"), "LLM chain must return to the reference after the CTA");
  assert.ok(promptChainSource.includes("где естественно завершается рассказ о продукте"), "LLM chain CTA must be embedded at the natural product mention");
  assert.ok(promptChainSource.includes("финальная часть ролика не состояла только из призыва"), "link CTA must be followed by a real conclusion");
  assert.ok(promptChainSource.includes("вопросом, приказом или новым призывом"), "CTA conclusion must be declarative");
  assert.ok(promptChainSource.includes("Для подтверждения достаточно одного конкретного факта"), "one concrete reference fact must be enough");
  assert.ok(promptChainSource.includes("Второй добавляй только когда"), "copywriter must not copy unnecessary reference lists");
  assert.ok(!promptChainSource.includes("сохрани минимум два конкретных примера"), "copywriter must not require two examples");
  assert.ok(promptChainSource.includes("без такого действия не считаются пользой"), "product benefit must name an action from the product description");
  assert.ok(!promptChainSource.includes("CTA: последняя фраза должна"), "link CTA must not be forced into the last sentence");
  assert.ok(!promptChainSource.includes("CTA может быть отдельной последней фразой"), "base prompt must not allow CTA-only endings");
  const creativeRepairSource = readFileSync(
    join(ui, "src/lib/server/omni/llm-prompt-chain-creative-repair.ts"),
    "utf8"
  );
  assert.ok(!creativeRepairSource.includes("CTA отдельной последней фразой"), "targeted repair must not reintroduce CTA-only endings");
  assert.ok(creativeRepairSource.includes("достаточно одного конкретного факта или примера"), "targeted repair must preserve one supporting fact");
  assert.ok(!creativeRepairSource.includes("сохрани минимум два конкретных примера"), "targeted repair must not restore the old strict gate");
  assert.ok(creativeRepairSource.includes("поставь CTA после его пользы, до полноценного финального вывода"), "full rebuild must keep a conclusion after CTA");
  assert.ok(creativeRepairSource.includes("Вопрос, приказ или новый призыв не считаются выводом"), "full rebuild must reject imperative endings");
  assert.ok(creativeRepairSource.includes("до финального вывода попроси написать"), "comment CTA must precede the conclusion");
  assert.ok(promptChainSource.includes("артикул или подробности можно найти в описании"), "LLM chain article CTA must identify the exact product variant");
  assert.ok(promptChainSource.includes("в описании упоминается только артикул"), "LLM chain article CTA must not speak article number");
  assert.ok(promptChainSource.includes("Не используй сухие шаблоны"), "LLM chain article CTA must avoid copy-pasted wording");
  assert.ok(promptChainSource.includes("в описании упоминается только артикул"), "LLM chain article CTA must not add extra description info");
  assert.ok(promptChainSource.includes("прямо раскрывает смысл spoken_words"), "storyboard frames must visualize their current speech");
  assert.ok(promptChainSource.includes("Выбирай product_cutaway и удерживание продукта в руках только когда смысл spoken_words"), "product cutaways must be meaning-driven");
  assert.ok(promptChainSource.includes("Для непредметных кадров создавай самостоятельную сцену"), "non-product speech must receive original visual direction");
  assert.ok(promptChainSource.includes("Первый segment сохраняет силу и макроформат хука reference"), "first segment must preserve the hook category without copying the source shot");
  assert.ok(promptChainSource.includes("После CTA продолжи или заверши исходный тезис reference"), "copywriter must conclude the reference thesis, not only the product benefit");
  assert.ok(semanticReviewerSource.includes("Не предлагай вопрос, приказ, CTA или императив"), "semantic repair feedback must not suggest forbidden imperative endings");
  assert.ok(semanticReviewerSource.includes("Не отклоняй полезный сценарий только потому"), "semantic review must allow concise reference adaptation");
  assert.ok(semanticReviewerSource.includes("Отдельная рекламная вставка, внезапное упоминание"), "semantic review must reject detached product ads");
  assert.ok(promptChainSource.includes("десять секунд это пять кадров"), "prompt chain must preserve exact frame counts");
  assert.ok(promptChainSource.includes("точный материал, крой и цвет reference не являются контрактом"), "wardrobe must not trigger paid regeneration");
  assert.ok(promptChainSource.includes("позу, взгляд и жест выбирай под текущую реплику"), "talking-head direction must serve the new script");
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

function requireSemanticReviewerWithStubs(reviewerPath) {
  const originalLoad = Module._load;
  Module._load = function loadWithSemanticReviewerStubs(request, parent, isMain) {
    if (request === "@/lib/omni/openrouter-cost") return { normalizeOpenRouterUsage: (value) => value };
    if (request === "./openrouter-pricing") return { getOpenRouterPricingSnapshot: async () => null };
    if (request === "./script-json-repair") return { parseAndRepairJson: () => ({}) };
    if (request === "./script-quality-contract") return { assertCtaConclusionContract: () => {} };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require(reviewerPath);
  } finally {
    Module._load = originalLoad;
  }
}

function passedSemanticReview() {
  return {
    version: "script-semantic-review-v1",
    passed: true,
    productNamed: true,
    productValueStated: true,
    hookAnswered: true,
    finalAnswerPresent: true,
    productNaturallyIntegrated: true,
    referenceMeaningPreserved: true,
    evidence: { product: "", value: "", answer: "" },
    issues: [],
    repairInstructions: [],
  };
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
