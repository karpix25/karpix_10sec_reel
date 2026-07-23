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
  const retryJsPath = findFile(output, "script-generation-retry.js");

  const { parseAndRepairJson } = require(repairJsPath);
  const {
    assertGeneratedScriptSymbolContract,
    validateViralScriptContract,
  } = require(qualityJsPath);
  const {
    buildScriptRetryFeedback,
    isRetryableScriptGenerationError,
    MAX_SCRIPT_GENERATION_ATTEMPTS,
  } = require(retryJsPath);

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

  console.log("Script Quality checks passed!");
  console.log("All tests passed successfully.");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function makeScript(wordCount) {
  return Array.from({ length: wordCount }, (_, index) => `слово${index + 1}`).join(" ");
}
