import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire, Module } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-creative-preflight-"));
const require = createRequire(import.meta.url);
const originalLoad = Module._load;
const originalFetch = global.fetch;
const originalKey = process.env.OPENROUTER_API_KEY;
const originalChain = process.env.OMNI_LLM_PROMPT_CHAIN;
// Public spoken text from failed Ref 956, not its private diagnostic/DB snapshot.
const failedScript = "Смотрите, это наш типичный вьетнамский обед на двоих. Суп Том Ям с крупными креветками, рис с морепродуктами и порция вареных креветок с лаймом обошлись нам очень недорого, а бутылка местного пива стоит всего тридцать рублей. Мы обожаем такие простые и доступные блюда. В зарубежных поездках российские карты больше не принимают. Я оформил Плати по миру виртуальная карта прямо в Телеграм и теперь легко оплачиваю любые счета. Ссылка в профиле. Путешествовать по миру стало намного проще и приятнее.";
const repairedScript = "Смотрите, это наш типичный вьетнамский обед на двоих. Мы заказали суп Том Ям с креветками. Взяли рис с морепродуктами и варёные креветки с лаймом. Местное пиво стоило тридцать рублей. Мы обожаем такие простые и доступные блюда. Перед поездкой отдельно решаем, чем будем оплачивать покупки. Я оформил Плати по миру виртуальная карта в Телеграм, чтобы оплачивать покупки за границей. Ссылка в профиле. Способ оплаты теперь подготовлен ещё до начала поездки.";
const input = {
  model: "local/mock", projectName: "Регрессия сценария", targetAudience: null, brandVoice: null,
  productName: "Плати по миру виртуальная карта",
  productDescription: "Оформление в Телеграм. Оплата покупок за границей.", productReferenceNotes: null,
  ctaMode: "link_in_profile", ctaValue: null, avatarSpeechGender: "male",
  sourceScenario: { id: "956", script: "Смотрите, это наш типичный вьетнамский обед на двоих. Суп Том Ям, рис с морепродуктами и креветки. Местное пиво стоит тридцать рублей." },
  adaptationPlan: {
    version: "script-adaptation-v1", mode: "writer_owned", reason: "Обед в поездке и оплата покупок",
    preserve: ["вьетнамский обед"], replace: [], productBridge: "Подготовить способ оплаты перед поездкой",
  },
  durationRange: {
    requestedMinSeconds: 30, requestedMaxSeconds: 40, minSeconds: 30, maxSeconds: 40,
    minWords: 45, maxWords: 80, source: "client_settings", wasClamped: false,
  },
};
const bridgeIssue = "Описание продукта не подтверждает оплату любых счетов.";
function reviewFor(script, failed = false) {
  const claim = script.includes("любые счета") ? "любые счета" : "кэшбэк";
  return {
    evidence: {
      product: input.productName, value: script.includes("любые счета") ? "оплачиваю любые счета" : script.includes("кэшбэк") ? "получаю кэшбэк" : "оплачивать покупки за границей",
      answer: "вьетнамский обед", answerKind: "explanation",
      referenceAnswer: "Смотрите, это наш типичный вьетнамский обед на двоих.", expectedAnswer: "вьетнамский обед", transition: "",
    },
    defects: failed ? [{ code: "unsupported_product_claim", scriptQuote: claim, expectedText: claim, message: bridgeIssue }] : [],
    warnings: [], repairInstructions: ["Добавь выдуманный бонус"],
  };
}
const unsupportedScript = repairedScript.replace("чтобы оплачивать покупки за границей", "и получаю кэшбэк за каждую покупку");
const passingReview = false;
const failingReview = true;

try {
  global.fetch = async () => { throw new Error("Unexpected network access in creative preflight regression"); };
  process.env.OPENROUTER_API_KEY = "local-test-placeholder";
  const config = join(output, "tsconfig.json");
  writeFileSync(config, JSON.stringify({
    compilerOptions: {
      target: "es2022", module: "commonjs", moduleResolution: "node", jsx: "react-jsx",
      rootDir: join(ui, "src"), outDir: output, baseUrl: join(ui, "src"), paths: { "@/*": ["*"] },
      strict: true, esModuleInterop: true, skipLibCheck: true,
      types: ["node"], typeRoots: [join(ui, "node_modules/@types")],
    },
    include: [join(ui, "src/lib/server/omni/script-generator.ts")],
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", config], { cwd: ui, stdio: "inherit" });
  Module._load = function (request, parent, isMain) {
    if (request === "./openrouter-pricing") return { getOpenRouterPricingSnapshot: async () => null };
    if (request.startsWith("@/")) return originalLoad.call(this, join(output, request.slice(2)), parent, isMain);
    return originalLoad.call(this, request, parent, isMain);
  };
  const preflight = require(join(output, "lib/server/omni/creative-script-preflight.js"));
  const copywriter = require(join(output, "lib/server/omni/llm-creative-copywriter.js"));
  const prompts = require(join(output, "lib/server/omni/llm-prompt-chain-prompts.js"));
  const planner = require(join(output, "lib/server/omni/omni-duration-planner.js"));
  const failed = preflight.collectCreativeScriptPreflight(input, failedScript);
  assert.deepEqual(failed.sentences.map((sentence) => sentence.wordCount), [8, 27, 7, 8, 16, 3, 8]);
  assert.equal(planner.countOmniScriptWords(failedScript), 77);
  assert.equal(failed.segmentPlan, null, "77 total words do not make a 27-word sentence speakable in one clip");
  assert.match(failed.issues.join("\n"), /Не удалось разделить сценарий/u);
  assert.match(preflight.renderCreativeScriptPreflight(failed), /Предложение 2, 27 слов:/u);

  const fragmented = [8, 13, 14, 7, 8, 16, 3, 8].map((count) => `${Array(count).fill("слово").join(" ")}.`).join(" ");
  assert.throws(() => planner.planOmniReelSegments(fragmented, { requireSentenceBoundaries: true }), /Не удалось разделить/u,
    "every sentence <=20 can still need six sequential clips; never bypass sentence boundaries");
  const jointLocal = preflight.collectCreativeScriptPreflight(input, failedScript.replace("Ссылка в профиле.", "Ссылка в описании."));
  assert.match(jointLocal.issues.join("\n"), /CTA|профил/u);
  assert.match(jointLocal.issues.join("\n"), /Не удалось разделить/u, "CTA failure must not hide timing failure");
  const mixedQuality = `${Array(24).fill("подробно").join(" ")}. В современном мире такой продукт поддержать здоровье. Ссылка в профиле.`;
  const qualityIssues = preflight.collectCreativeScriptPreflight(input, mixedQuality).issues.join("\n");
  for (const pattern of [/текст звучит неграмотно/u, /не называет продукт/u]) {
    assert.match(qualityIssues, pattern, "one quality failure must not hide another before the only repair attempt");
  }
  const valid = preflight.collectCreativeScriptPreflight(input, repairedScript);
  assert.deepEqual(valid.issues, []);
  const endingWithCta = repairedScript.replace(" Способ оплаты теперь подготовлен ещё до начала поездки.", "");
  assert.deepEqual(preflight.collectCreativeScriptPreflight(input, endingWithCta).issues, [], "CTA can finish an already complete story");
  const appendedCta = preflight.collectCreativeScriptPreflight(input, repairedScript, {
    rawScriptBeforeCta: repairedScript.replace("Ссылка в профиле. ", ""), rawScriptFromModel: repairedScript,
  });
  assert.equal(appendedCta.qualityCheck.metrics.ctaAppended, true, "fallback quality metrics retain the original pre-CTA text");
  assert.equal(appendedCta.qualityCheck.score, valid.qualityCheck.score - 10);
  assert.ok(valid.segmentPlan.segmentCount <= 5);
  assert.equal(valid.segmentPlan.segments.map((segment) => segment.text).join(" "), repairedScript);
  assert.match(preflight.renderCreativeScriptPreflight(valid), /Разбиение уже проверено/u);
  assert.ok(prompts.buildCreativeCopywriterPrompt({ ...input, durationRange: undefined }).includes(preflight.CREATIVE_SPEECH_PACKING_RULE),
    "default-duration prompt must carry the same whole-plan packing contract");

  const recovered = await simulate([failedScript, repairedScript], [failingReview, passingReview]);
  assert.ifError(recovered.error);
  assert.equal(recovered.result.draft.script, repairedScript, "only the explicitly repaired candidate may replace speech");
  assert.equal(recovered.requests.length, 2);
  assert.equal(recovered.reviews.length, 2, "semantic feedback is collected despite the first local packing failure");
  assert.match(recovered.requests[1].userPrompt, /Предложение 2, 27 слов:/u);
  assert.match(recovered.requests[1].userPrompt, /Неподтверждённое свойство продукта: «любые счета»/u, "one repair receives controlled factual feedback with timing");
  assert.ok(!recovered.requests[1].userPrompt.includes(bridgeIssue), "raw model advice stays diagnostic, not repair instructions");
  assert.match(recovered.requests[1].userPrompt, /Удали или исправь неподтверждённое свойство/u);
  assert.doesNotMatch(recovered.requests[1].userPrompt, /Добавь выдуманный бонус/u);
  assert.deepEqual(recovered.usage.map((usage) => usage.attempt), [1, 2]);
  assert.equal(recovered.result.diagnostics[0].semanticPassed, false);
  assert.equal(recovered.result.diagnostics[1].failure, null);
  assert.deepEqual(recovered.result.segmentPlan.segments.map((segment) => segment.text),
    recovered.result.draft.speechSegments.map((segment) => segment.voiceover), "Director receives the writer's exact boundaries");

  const stillInvalid = await simulate([failedScript, failedScript], [passingReview, passingReview]);
  assert.ok(stillInvalid.error instanceof copywriter.CreativeCopywriterFailure);
  assert.equal(stillInvalid.requests.length, 2);
  assert.equal(stillInvalid.reviews.length, 2);
  const diagnostics = stillInvalid.error.partialSnapshot.creativeAttemptDiagnostics;
  assert.equal(diagnostics.length, 2);
  for (const diagnostic of diagnostics) {
    assert.deepEqual(diagnostic.sentenceWordCounts, [8, 27, 7, 8, 16, 3, 8]);
    assert.equal(diagnostic.semanticPassed, true);
    assert.match(diagnostic.failure, /Длины предложений.*27/u);
  }
  const regressed = await simulate([unsupportedScript, failedScript], [failingReview, passingReview]);
  assert.ok(regressed.error instanceof copywriter.CreativeCopywriterFailure, "a semantic repair must revalidate its new sentence packing");
  assert.match(regressed.requests[1].userPrompt, /Разбиение уже проверено/u);
  assert.match(regressed.error.partialSnapshot.creativeAttemptDiagnostics[1].failure, /Длины предложений.*27/u);
  const semanticFailure = await simulate([unsupportedScript, unsupportedScript], [failingReview, failingReview]);
  assert.ok(semanticFailure.error instanceof copywriter.CreativeCopywriterFailure, "valid timing never bypasses semantic rejection");
  assert.match(semanticFailure.error.message, /Неподтверждённое свойство продукта/u);

  const longScript = `${repairedScript} ${"Мы заранее изучили меню ближайшего кафе. ".repeat(8).trim()}`;
  assert.ok(planner.countOmniScriptWords(longScript) > 100);
  const overflow = await simulate([longScript, longScript], [passingReview, passingReview]);
  assert.ok(overflow.error instanceof copywriter.CreativeCopywriterFailure);
  assert.equal(overflow.error.partialSnapshot.creativeScriptDraft.script, longScript, "never remove whole sentences automatically to meet a budget");
  assert.ok(overflow.reviews.every((body) => body.messages.at(-1).content.endsWith(longScript)), "review the intact overflowing text");

  const runner = require(join(output, "lib/server/omni/llm-prompt-chain-runner.js"));
  let mainCalls = 0;
  global.fetch = async (url, options) => {
    assert.equal(String(url), "https://openrouter.ai/api/v1/chat/completions");
    assert.ok(++mainCalls <= 4, "invalid speech must never reach the director");
    const content = options.headers["X-Title"] === "Omni Reels Script Semantic Review"
      ? JSON.stringify(reviewFor(failedScript)) : writerResponse(failedScript);
    return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
  };
  await assert.rejects(runner.runLlmPromptChain(input), (error) => {
    assert.ok(error instanceof runner.LlmPromptChainFailure);
    assert.equal(error.stage, "creative_copywriter");
    assert.equal(error.partialSnapshot.creativeAttemptDiagnostics.length, 2);
    return true;
  });
  assert.equal(mainCalls, 4);
  assert.throws(() => runner.assertPromptChainNumericRangeIntegrity("От 200 до 300 рублей.", "Двести тысяч триста рублей."), /схлопнул/u);

  const generator = require(join(output, "lib/server/omni/script-generator.js"));
  process.env.OMNI_LLM_PROMPT_CHAIN = "false";
  mainCalls = 0;
  await assert.rejects(generator.generateScript(input), (error) => {
    assert.ok(error instanceof runner.LlmPromptChainFailure);
    assert.equal(error.stage, "creative_copywriter");
    assert.equal(error.partialSnapshot.creativeAttemptDiagnostics.length, 2);
    return true;
  });
  assert.equal(mainCalls, 4, "The legacy flag must use the same bounded chain, with no fallback");
  console.log("Creative preflight passed: Ref956, v2 grounded feedback, exact JSON speech, one repair, legacy flag uses single pipeline.");

  function writerResponse(script) {
    let segments;
    try {
      const plan = planner.planOmniReelSegments(script, { requireSentenceBoundaries: true });
      segments = plan.segments.map((segment, index) => ({ duration_seconds: plan.segmentDurationsSeconds[index], voiceover: segment.text }));
    } catch {
      const sentences = script.split(/(?<=[.!?])\s+/u);
      while (sentences.length > 5) sentences.splice(-2, 2, sentences.slice(-2).join(" "));
      segments = sentences.map((voiceover) => ({ duration_seconds: 10, voiceover }));
    }
    return JSON.stringify({ segments });
  }

  async function simulate(candidates, responses) {
    const requests = [], reviews = [], usage = [];
    global.fetch = async (url, options) => {
      assert.equal(String(url), "https://openrouter.ai/api/v1/chat/completions", "only mocked semantic review is permitted");
      assert.ok(reviews.length < 2, "semantic reviewer must keep the two-call ceiling");
      const body = JSON.parse(options.body);
      assert.ok(reviews.length < responses.length, "unexpected semantic call");
      const response = reviewFor(candidates[reviews.length], responses[reviews.length]);
      reviews.push(body);
      return { ok: true, json: async () => ({ model: input.model, choices: [{ message: { content: JSON.stringify(response) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }) };
    };
    try {
      const result = await copywriter.runCreativeCopywriter(input, (record) => usage.push(record), async (request) => {
        assert.ok(requests.length < 2, "writer must keep the two-call ceiling");
        if (requests.length === 1) assert.equal(reviews.length, 1, "semantic issues must be known before repair starts");
        requests.push(request);
        return writerResponse(candidates[request.attempt - 1]);
      });
      return { result, error: null, requests, reviews, usage };
    } catch (error) { return { result: null, error, requests, reviews, usage }; }
  }
} finally {
  Module._load = originalLoad;
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalKey;
  if (originalChain === undefined) delete process.env.OMNI_LLM_PROMPT_CHAIN;
  else process.env.OMNI_LLM_PROMPT_CHAIN = originalChain;
  rmSync(output, { recursive: true, force: true });
}
