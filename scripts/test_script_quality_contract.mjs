import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-script-quality-"));
const require = createRequire(import.meta.url);

// Helper to find files dynamically in the compiled output directory
function findFile(base, filename) {
  const queue = [base];
  while (queue.length > 0) {
    const current = queue.shift();
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
      } else if (entry.name === filename) {
        return fullPath;
      }
    }
  }
  throw new Error(`File ${filename} not found in ${base}`);
}

try {
  // Compile typescript modules using local tsc
  execFileSync(
    join(ui, "node_modules/.bin/tsc"),
    [
      "src/lib/server/omni/script-quality-contract.ts",
      "src/lib/server/omni/reference-meaning-contract.ts",
      "src/lib/server/omni/script-json-repair.ts",
      "src/lib/server/omni/script-generation-retry.ts",
      "--outDir", output,
      "--module", "commonjs",
      "--target", "es2022",
      "--skipLibCheck",
    ],
    { cwd: ui, stdio: "inherit" }
  );

  const repairJsPath = findFile(output, "script-json-repair.js");
  const qualityJsPath = findFile(output, "script-quality-contract.js");
  const referenceMeaningJsPath = findFile(output, "reference-meaning-contract.js");
  const retryJsPath = findFile(output, "script-generation-retry.js");

  const { parseAndRepairJson } = require(repairJsPath);
  const {
    assertGeneratedScriptSymbolContract,
    validateViralScriptContract,
  } = require(qualityJsPath);
  const {
    buildScriptRetryFeedback,
    isRetryableScriptGenerationError,
    isReferenceMeaningScriptGenerationError,
    MAX_REFERENCE_MEANING_REPAIR_ATTEMPTS,
    MAX_SCRIPT_GENERATION_ATTEMPTS,
  } = require(retryJsPath);
  const { buildReferenceMeaningRepairGuidance } = require(referenceMeaningJsPath);

  // --- Test JSON Repair ---
  console.log("Running JSON Repair checks...");

  // 1. Clean JSON
  const cleanJson = `{"title": "Clean Script", "script": "Hello"}`;
  assert.deepEqual(parseAndRepairJson(cleanJson), { title: "Clean Script", script: "Hello" });

  // 2. Markdown fences and surrounding prose
  const fencedJson = `
  Here is your script:
  \`\`\`json
  {
    "title": "Fenced Script",
    "script": "Line 1"
  }
  \`\`\`
  Hope you like it!
  `;
  assert.deepEqual(parseAndRepairJson(fencedJson), { title: "Fenced Script", script: "Line 1" });

  // 3. Trailing comma and smart quotes
  const malformedJson = `
  {
    “title”: “Smart Quotes”,
    “script”: “Some text”,
  }
  `;
  assert.deepEqual(parseAndRepairJson(malformedJson), { title: "Smart Quotes", script: "Some text" });

  // 4. Smart quotes inside valid JSON string values should remain prose, not become delimiters
  const smartQuotesInsideValue = `
  {
    "title": "Quote inside text",
    "script": "Метод “двух шагов” помогает объяснить идею проще."
  }
  `;
  assert.deepEqual(parseAndRepairJson(smartQuotesInsideValue), {
    title: "Quote inside text",
    script: "Метод “двух шагов” помогает объяснить идею проще."
  });

  // 5. Unescaped newlines inside quotes
  const multilineValJson = `
  {
    "title": "Multiline value",
    "script": "This is line 1.
And this is line 2."
  }
  `;
  assert.deepEqual(parseAndRepairJson(multilineValJson), {
    title: "Multiline value",
    script: "This is line 1.\nAnd this is line 2."
  });

  // 6. Single quotes fallback
  const singleQuotesJson = `
  {
    'title': 'Single quotes test',
    'script': 'Another test'
  }
  `;
  assert.deepEqual(parseAndRepairJson(singleQuotesJson), {
    title: "Single quotes test",
    script: "Another test"
  });

  // 7. Missing commas between adjacent array objects
  const missingCommaJson = `{
    "panels": [
      {"panel_index": 1}
      {"panel_index": 2}
    ]
  }`;
  assert.deepEqual(parseAndRepairJson(missingCommaJson), {
    panels: [{ panel_index: 1 }, { panel_index: 2 }],
  });

  console.log("JSON Repair checks passed!");

  // --- Test Script Quality Contract ---
  console.log("Running Script Quality checks...");

  const baseGoodScript = "Хочешь запустить свой бизнес? Но постоянно боишься ошибок и откладываешь старт. Начни с одной проверки гипотезы на реальных клиентах. Наш ИИ-конструктор сайтов поможет быстро собрать страницу, показать оффер и понять, есть ли спрос. Напиши кодовое слово «СТАРТ» в комментариях.";

  // A. Good script with comments mode
  const res1 = validateViralScriptContract({
    script: baseGoodScript,
    rawScriptBeforeCta: baseGoodScript,
    rawScriptFromModel: baseGoodScript,
    hook: "Хочешь запустить свой бизнес?",
    productName: "ИИ-конструктор сайтов",
    ctaMode: "keyword_in_comments",
    ctaValue: "СТАРТ"
  });
  assert(res1.score > 70);
  assert.equal(res1.metrics.wordCount, 39);
  assert.equal(res1.metrics.productMentioned, true);
  assert.equal(res1.metrics.hasContrast, true); // "Но"
  assert.equal(res1.metrics.hasProblem, true); // "боишься" or "ошибок"

  const shortDenseScript = "Запускаешь бизнес? Проверь идею за вечер: ИИ-конструктор сайтов быстро собирает страницу, показывает оффер клиентам и помогает понять спрос. Напиши слово «СТАРТ» в комментариях.";
  const shortDenseResult = validateViralScriptContract({
    script: shortDenseScript,
    rawScriptBeforeCta: shortDenseScript,
    rawScriptFromModel: shortDenseScript,
    hook: "Запускаешь бизнес?",
    productName: "ИИ-конструктор сайтов",
    ctaMode: "keyword_in_comments",
    ctaValue: "СТАРТ"
  });
  assert.equal(shortDenseResult.metrics.wordCount, 23);
  assert(shortDenseResult.score > 70);

  // B. Too short script (should throw)
  assert.throws(
    () => validateViralScriptContract({
      script: "Привет, это короткий текст.",
      rawScriptBeforeCta: "Привет, это короткий текст.",
      rawScriptFromModel: "Привет, это короткий текст.",
      hook: "Привет",
      productName: "Тест",
      ctaMode: "no_explicit_cta",
      ctaValue: null
    }),
    /слишком короткий/u
  );

  const flexibleDensityScript = makeScript(34);
  const flexibleDensityResult = validateViralScriptContract({
    script: flexibleDensityScript,
    rawScriptBeforeCta: flexibleDensityScript,
    rawScriptFromModel: flexibleDensityScript,
    hook: "слово1",
    productName: "ИИ-конструктор сайтов",
    ctaMode: "keyword_in_comments",
    ctaValue: "СТАРТ"
  });
  assert.equal(flexibleDensityResult.metrics.wordCount, 34);

  assert.throws(
    () => validateViralScriptContract({
      script: makeScript(40),
      rawScriptBeforeCta: makeScript(40),
      rawScriptFromModel: makeScript(40),
      hook: "слово1",
      productName: "ИИ-конструктор сайтов",
      ctaMode: "keyword_in_comments",
      ctaValue: "СТАРТ",
      durationRange: {
        requestedMinSeconds: 30,
        requestedMaxSeconds: 30,
        minSeconds: 30,
        maxSeconds: 30,
        minWords: 60,
        maxWords: 72,
        source: "client_settings",
        wasClamped: false,
      }
    }),
    /слишком короткий для выбранной длины ролика/u
  );

  const nearDurationMinScript = makeScript(61);
  const nearDurationMinResult = validateViralScriptContract({
    script: nearDurationMinScript,
    rawScriptBeforeCta: nearDurationMinScript,
    rawScriptFromModel: nearDurationMinScript,
    hook: "слово1",
    productName: "слово1",
    ctaMode: "no_explicit_cta",
    ctaValue: null,
    durationRange: {
      requestedMinSeconds: 30,
      requestedMaxSeconds: 30,
      minSeconds: 30,
      maxSeconds: 30,
      minWords: 62,
      maxWords: 75,
      source: "client_settings",
      wasClamped: false,
    }
  });
  assert.equal(nearDurationMinResult.metrics.wordCount, 61);
  assert.ok(
    nearDurationMinResult.warnings.some((warning) => warning.includes("принят в пределах допуска")),
    "near-miss lower word count must pass with an explicit warning"
  );

  assert.throws(
    () => validateViralScriptContract({
      script: makeScript(59),
      rawScriptBeforeCta: makeScript(59),
      rawScriptFromModel: makeScript(59),
      hook: "слово1",
      productName: "слово1",
      ctaMode: "no_explicit_cta",
      ctaValue: null,
      durationRange: {
        requestedMinSeconds: 30,
        requestedMaxSeconds: 30,
        minSeconds: 30,
        maxSeconds: 30,
        minWords: 62,
        maxWords: 75,
        source: "client_settings",
        wasClamped: false,
      }
    }),
    /слишком короткий для выбранной длины ролика/u
  );

  const overDurationResult = validateViralScriptContract({
    script: makeScript(76),
    rawScriptBeforeCta: makeScript(76),
    rawScriptFromModel: makeScript(76),
    hook: "слово1",
    productName: "слово1",
    ctaMode: "no_explicit_cta",
    ctaValue: null,
    durationRange: {
      requestedMinSeconds: 30,
      requestedMaxSeconds: 30,
      minSeconds: 30,
      maxSeconds: 30,
      minWords: 62,
      maxWords: 75,
      source: "client_settings",
      wasClamped: false,
    }
  });
  assert.ok(overDurationResult.warnings.some((warning) => warning.includes("сжать до лимита четырех частей")));

  assert.throws(
    () => validateViralScriptContract({
      script: makeScript(106),
      rawScriptBeforeCta: makeScript(106),
      rawScriptFromModel: makeScript(106),
      hook: "слово1",
      productName: "Тест",
      ctaMode: "no_explicit_cta",
      ctaValue: null,
    }),
    /Максимум 100 слов/u
  );

  // C. Too long hook (should throw)
  assert.throws(
    () => validateViralScriptContract({
      script: "Это очень-очень длинное первое предложение, которое абсолютно не подходит для формата коротких видео роликов инстаграм рилс, потому что зритель мгновенно уснет и пролистает дальше не глядя.",
      rawScriptBeforeCta: "Это очень-очень длинное первое предложение, которое абсолютно не подходит для формата коротких видео роликов инстаграм рилс, потому что зритель мгновенно уснет и пролистает дальше не глядя.",
      rawScriptFromModel: "Это очень-очень длинное первое предложение, которое абсолютно не подходит для формата коротких видео роликов инстаграм рилс, потому что зритель мгновенно уснет и пролистает дальше не глядя.",
      hook: null,
      productName: "Тест",
      ctaMode: "no_explicit_cta",
      ctaValue: null
    }),
    /слишком длинное для Reels/u
  );

  // D. Severe slop "в современном мире" (should throw)
  const severeSlopScript = "В современном мире каждый человек должен уметь программировать на Python, чтобы создавать автоматизированные системы и работать удаленно. Этот навык помогает быстрее проверять идеи, собирать простые проекты, экономить время на рутине и уверенно расти в новой профессии.";
  assert.throws(
    () => validateViralScriptContract({
      script: severeSlopScript,
      rawScriptBeforeCta: severeSlopScript,
      rawScriptFromModel: severeSlopScript,
      hook: null,
      productName: "Python",
      ctaMode: "no_explicit_cta",
      ctaValue: null
    }),
    /запрещенное AI-слово\/фразу "в современном мире"/ui
  );

  // E. Long dashes and emojis from the raw model output must be rejected, not silently cleaned
  assert.throws(
    () => validateViralScriptContract({
      script: "Этот инструмент помогает быстро проверить идею без сложной подготовки. Напиши слово СТАРТ в комментариях.",
      rawScriptBeforeCta: "Этот инструмент помогает быстро проверить идею без сложной подготовки. Напиши слово СТАРТ в комментариях.",
      rawScriptFromModel: "Этот инструмент помогает быстро проверить идею — без сложной подготовки 😊. Напиши слово СТАРТ в комментариях.",
      hook: "Этот инструмент помогает быстро проверить идею",
      productName: "Инструмент",
      ctaMode: "keyword_in_comments",
      ctaValue: "СТАРТ"
    }),
    /emoji или длинное тире/u
  );

  assert.throws(
    () => assertGeneratedScriptSymbolContract(
      '{"title":"Быстрый старт 😊","script":"Этот инструмент помогает проверить идею без сложной подготовки и лишних шагов."}'
    ),
    /emoji или длинное тире/u
  );

  assert.equal(MAX_SCRIPT_GENERATION_ATTEMPTS, 5);
  assert.equal(
    isRetryableScriptGenerationError(new Error("Сценарий отклонен: исходный ответ модели содержит emoji или длинное тире.")),
    true
  );
  assert.equal(
    isRetryableScriptGenerationError(new Error("Script model request failed: 429 rate limit")),
    false
  );
  assert.match(
    buildScriptRetryFeedback(new Error("Сценарий отклонен: исходный ответ модели содержит emoji или длинное тире.")),
    /запятую или точку/u
  );
  const meaningReference = "Коллаген распадается до аминокислот, но усваивается не только как еда. Пептиды дают клеткам сигнал.";
  const meaningError = new Error("Сценарий отклонен: потерян смысл reference-видео. Верни по смыслу эти опоры: усваива.");
  assert.equal(isReferenceMeaningScriptGenerationError(meaningError), true);
  assert.equal(MAX_REFERENCE_MEANING_REPAIR_ATTEMPTS, 2);
  assert.match(buildReferenceMeaningRepairGuidance(meaningReference), /усваива/u);
  assert.match(
    buildScriptRetryFeedback(meaningError, { referenceScript: meaningReference }),
    /Это требование сохраняется/u
  );

  // F. Minor slop / clickbaits and warnings (checks score reductions)
  const minorSlopScript = "Уникальный инструмент для автоматизации рутинных процессов помогает быстро убрать хаос в задачах. Не листай дальше, если хочешь узнать больше полезных советов по повышению продуктивности в вашей работе. Покажи команде один простой сценарий и проверь результат уже сегодня.";
  const res2 = validateViralScriptContract({
    script: minorSlopScript,
    rawScriptBeforeCta: minorSlopScript,
    rawScriptFromModel: minorSlopScript,
    hook: null,
    productName: "Инструмент",
    ctaMode: "no_explicit_cta",
    ctaValue: null
  });
  // warnings should catch "Уникальный", "не листай"
  assert(res2.warnings.some(w => w.includes("не листай")));
  assert(res2.warnings.some(w => w.includes("уникальный")));

  const collagenReference = [
    "Пить или не пить коллаген, вот в чем вопрос.",
    "Коллаген распадается до аминокислот, поэтому многие думают, что он бесполезен.",
    "Но пептиды и аминокислоты работают как строительный материал и сигнал клеткам.",
    "Они активируют фибробласты, синтез коллагена и гиалуроновой кислоты.",
  ].join(" ");
  const genericCollagenScript = "Я нашла настоящий эликсир молодости, который изменил мое самочувствие. Это апельсиновое желе с коллагеном очень вкусное. Оно поддерживает кожу, волосы и ногти. Одна ложечка в день помогает чувствовать себя лучше уже через пару недель, а артикул именно на этот продукт есть в описании.";
  assert.throws(
    () => validateViralScriptContract({
      script: genericCollagenScript,
      rawScriptBeforeCta: genericCollagenScript,
      rawScriptFromModel: genericCollagenScript,
      hook: "Я нашла настоящий эликсир молодости",
      productName: "Апельсиновый коллаген",
      ctaMode: "article_in_description",
      ctaValue: null,
      referenceScript: collagenReference,
    }),
    /потерян смысл reference-видео/u
  );

  const semanticCollagenScript = "Пить коллаген правда есть смысл? Главное не ждать магии от одной ложечки. Внутри работают пептиды и аминокислоты, они дают клеткам сигнал и материал для синтеза коллагена. Поэтому апельсиновый коллаген в желе я беру как удобную ежедневную поддержку кожи и суставов, а артикул именно на него есть в описании.";
  const semanticResult = validateViralScriptContract({
    script: semanticCollagenScript,
    rawScriptBeforeCta: semanticCollagenScript,
    rawScriptFromModel: semanticCollagenScript,
    hook: "Пить коллаген правда есть смысл?",
    productName: "Апельсиновый коллаген",
    ctaMode: "article_in_description",
    ctaValue: null,
    referenceScript: collagenReference,
  });
  assert.equal(semanticResult.metrics.referenceMeaning.passed, true);
  assert.ok(semanticResult.metrics.referenceMeaning.coveredSignals.includes("пептид"));

  const awkwardCollagenScript = "Думаете, весь коллаген одинаковый? Расскажу, как найти свой идеальный вариант. В идеале выбор зависит от ваших целей и образа жизни. Например, двадцать пять граммов морского коллагена с витамином С, как этот апельсиновый, отлично подходит для активных девушек. Он помогает поддерживать кожу, волосы, ногти и суставы. Такой продукт поддержать ваш ритм жизни, а не мешать ему. Если сомневаетесь, этот апельсиновый коллаген подойдет практически всем. Артикул или код продукта вы можете найти прямо в описании.";
  assert.throws(
    () => validateViralScriptContract({
      script: awkwardCollagenScript,
      rawScriptBeforeCta: awkwardCollagenScript,
      rawScriptFromModel: awkwardCollagenScript,
      hook: "Думаете, весь коллаген одинаковый?",
      productName: "Апельсиновый коллаген",
      ctaMode: "article_in_description",
      ctaValue: null,
    }),
    /неграмотно|повторяется слишком часто/u
  );

  const awkwardCtaScript = "Этот коллаген удобно добавить утром после завтрака. Он поддерживает привычку без сложных шагов и вписывается в обычный уход. Артикул или код продукта можно найти в описании.";
  assert.throws(
    () => validateViralScriptContract({
      script: awkwardCtaScript,
      rawScriptBeforeCta: awkwardCtaScript,
      rawScriptFromModel: awkwardCtaScript,
      hook: "Этот коллаген удобно добавить утром после завтрака.",
      productName: "Апельсиновый коллаген",
      ctaMode: "article_in_description",
      ctaValue: null,
    }),
    /CTA звучит канцелярски/u
  );

  const detachedCtaScript = "Этот коллаген удобно добавить утром после завтрака. Он поддерживает привычку без сложных шагов и вписывается в обычный уход. Я оставила его в описании.";
  assert.equal(validateViralScriptContract({
    script: detachedCtaScript,
    rawScriptBeforeCta: detachedCtaScript,
    rawScriptFromModel: detachedCtaScript,
    hook: "Этот коллаген удобно добавить утром после завтрака.",
    productName: "Апельсиновый коллаген",
    ctaMode: "article_in_description",
    ctaValue: null,
  }).metrics.wordCount, 23);

  const stockCtaScript = "Этот коллаген удобно добавить утром после завтрака. Он поддерживает привычку без сложных шагов и вписывается в обычный уход. Чтобы не перепутать с похожими, артикул будет в описании.";
  assert.equal(validateViralScriptContract({
    script: stockCtaScript,
    rawScriptBeforeCta: stockCtaScript,
    rawScriptFromModel: stockCtaScript,
    hook: "Этот коллаген удобно добавить утром после завтрака.",
    productName: "Апельсиновый коллаген",
    ctaMode: "article_in_description",
    ctaValue: null,
  }).metrics.wordCount, 27);

  const detailsInsteadOfArticleScript = "Этот коллаген удобно добавить утром после завтрака. Он поддерживает привычку без сложных шагов и вписывается в обычный уход. Детали на этот продукт есть в описании.";
  assert.throws(
    () => validateViralScriptContract({
      script: detailsInsteadOfArticleScript,
      rawScriptBeforeCta: detailsInsteadOfArticleScript,
      rawScriptFromModel: detailsInsteadOfArticleScript,
      hook: "Этот коллаген удобно добавить утром после завтрака.",
      productName: "Апельсиновый коллаген",
      ctaMode: "article_in_description",
      ctaValue: null,
    }),
    /должен направлять к артикулу или самому продукту/u
  );

  const expertClaimScript = "Мне тридцать лет, я врач косметолог, и вот мои три принципа в домашнем уходе. Первое, мягкое умывание. Энзимная пенка Geodemika мягко очищает кожу, а артикул именно на нее есть в описании.";
  assert.throws(
    () => validateViralScriptContract({
      script: expertClaimScript,
      rawScriptBeforeCta: expertClaimScript,
      rawScriptFromModel: expertClaimScript,
      hook: "Мне тридцать лет",
      productName: "Geodemika Enzyme Cleansing Foam",
      ctaMode: "article_in_description",
      ctaValue: null,
    }),
    /профессиональную роль автора reference/u
  );

  console.log("Script Quality checks passed!");
  console.log("All tests passed successfully.");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function makeScript(wordCount) {
  return Array.from({ length: wordCount }, (_, index) => `слово${index + 1}`).join(" ");
}
