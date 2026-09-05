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
const bridgeIssue = "Переход от обеда к оплате пока не объяснён.";
const passingReview = {
  passed: true, productNamed: true, productValueStated: true, hookAnswered: true,
  finalAnswerPresent: true, productNaturallyIntegrated: true, referenceMeaningPreserved: true,
  evidence: { product: input.productName, value: "оплата покупок", answer: "вьетнамский обед", transition: "способ оплаты перед поездкой" },
  issues: [], repairInstructions: [],
};
const failingReview = {
  ...passingReview, passed: false, productNaturallyIntegrated: false,
  issues: [bridgeIssue], repairInstructions: ["Объясните подготовку способа оплаты перед поездкой."],
};

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
  const retry = require(join(output, "lib/server/omni/script-generation-retry.js"));
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
  const missingConclusion = failedScript.replace(/ Путешествовать по миру[^.]+\.$/u, "");
  const jointLocal = preflight.collectCreativeScriptPreflight(input, missingConclusion);
  assert.match(jointLocal.issues.join("\n"), /после CTA/u);
  assert.match(jointLocal.issues.join("\n"), /Не удалось разделить/u, "CTA failure must not hide timing failure");
  const mixedQuality = `${Array(24).fill("подробно").join(" ")}. В современном мире такой продукт поддержать здоровье. Ссылка в профиле.`;
  const qualityIssues = preflight.collectCreativeScriptPreflight(input, mixedQuality).issues.join("\n");
  for (const pattern of [/хук или первое предложение слишком длинное/u, /запрещенное AI-слово/u, /текст звучит неграмотно/u, /после CTA/u]) {
    assert.match(qualityIssues, pattern, "one quality failure must not hide another before the only repair attempt");
  }
  const valid = preflight.collectCreativeScriptPreflight(input, repairedScript);
  assert.deepEqual(valid.issues, []);
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
  assert.ok(recovered.requests[1].userPrompt.includes(bridgeIssue), "one repair receives both timing and semantic issues");
  assert.deepEqual(recovered.usage.map((usage) => usage.attempt), [1, 2]);
  assert.equal(recovered.result.diagnostics[0].semanticPassed, false);
  assert.equal(recovered.result.diagnostics[1].failure, null);

  const stillInvalid = await simulate([failedScript, failedScript], [passingReview, passingReview]);
  assert.ok(stillInvalid.error instanceof copywriter.CreativeCopywriterFailure);
  assert.equal(stillInvalid.requests.length, 2);
  assert.equal(stillInvalid.reviews.length, 2);
  const diagnostics = stillInvalid.error.partialSnapshot.creativeAttemptDiagnostics;
  assert.equal(diagnostics.length, 2);
  for (const diagnostic of diagnostics) {
    assert.deepEqual(diagnostic.sentenceWordCounts, [8, 27, 7, 8, 16, 3, 8]);
    assert.equal(diagnostic.semanticPassed, true);
    assert.match(diagnostic.failure, /Не удалось разделить/u);
  }
  const regressed = await simulate([repairedScript, failedScript], [failingReview, passingReview]);
  assert.ok(regressed.error instanceof copywriter.CreativeCopywriterFailure, "a semantic repair must revalidate its new sentence packing");
  assert.match(regressed.requests[1].userPrompt, /Разбиение уже проверено/u);
  assert.match(regressed.error.partialSnapshot.creativeAttemptDiagnostics[1].failure, /Не удалось разделить/u);
  const semanticFailure = await simulate([repairedScript, repairedScript], [failingReview, failingReview]);
  assert.ok(semanticFailure.error instanceof copywriter.CreativeCopywriterFailure, "valid timing never bypasses semantic rejection");
  assert.ok(semanticFailure.error.message.includes(bridgeIssue));

  const longScript = `${repairedScript} ${"Мы заранее изучили меню ближайшего кафе. ".repeat(8).trim()}`;
  assert.ok(planner.countOmniScriptWords(longScript) > 100);
  const overflow = await simulate([longScript, longScript], [passingReview, passingReview]);
  assert.ok(overflow.error instanceof copywriter.CreativeCopywriterFailure);
  assert.equal(overflow.error.partialSnapshot.creativeScriptDraft.script, longScript, "never remove whole sentences automatically to meet a budget");
  assert.ok(overflow.reviews.every((body) => body.messages.at(-1).content.endsWith(longScript)), "review the intact overflowing text");
  let fallbackReviews = 0;
  global.fetch = async (url, options) => {
    assert.equal(String(url), "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(++fallbackReviews, 1);
    assert.ok(JSON.parse(options.body).messages.at(-1).content.endsWith(failedScript));
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(failingReview) } }] }) };
  };
  const fallbackEvaluation = await copywriter.evaluateCreativeScriptDraft(input, failedScript, () => {}, 1);
  const fallbackError = new preflight.CreativeScriptValidationError(fallbackEvaluation.preflight, failedScript, fallbackEvaluation.issues);
  assert.equal(retry.isRetryableScriptGenerationError(fallbackError), true);
  const feedback = retry.buildScriptRetryFeedback(fallbackError, { referenceScript: input.sourceScenario.script });
  assert.match(feedback, /Предложение 2, 27 слов:/u);
  assert.ok(feedback.includes(bridgeIssue), "fallback repair keeps semantic feedback together with packing errors");
  assert.ok(feedback.endsWith(failedScript), "fallback repair receives the complete rejected candidate");
  assert.match(feedback, /полный исправленный JSON по исходной схеме/u);
  assert.match(feedback, /script и beats.voiceover должны совпадать/u);
  assert.doesNotMatch(feedback, /только.*сценарий без JSON/u, "fallback repair must not inherit the plain-text writer output contract");

  const runner = require(join(output, "lib/server/omni/llm-prompt-chain-runner.js"));
  let mainCalls = 0;
  global.fetch = async (url, options) => {
    assert.equal(String(url), "https://openrouter.ai/api/v1/chat/completions");
    assert.ok(++mainCalls <= 4, "invalid speech must never reach the director");
    const content = options.headers["X-Title"] === "Omni Reels Script Semantic Review"
      ? JSON.stringify(passingReview) : failedScript;
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
  const fallbackRequests = [];
  let fullFallbackReviews = 0;
  global.fetch = async (url, options) => {
    assert.equal(String(url), "https://openrouter.ai/api/v1/chat/completions");
    let content;
    if (options.headers["X-Title"] === "Omni Reels Script Semantic Review") {
      assert.ok(++fullFallbackReviews <= 2);
      content = JSON.stringify(fullFallbackReviews === 1 ? failingReview : passingReview);
    } else {
      fallbackRequests.push(JSON.parse(options.body));
      assert.ok(fallbackRequests.length <= 2);
      content = JSON.stringify({ script: fallbackRequests.length === 1 ? failedScript : repairedScript });
    }
    return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
  };
  const fallbackResult = await generator.generateScript(input);
  assert.equal(fallbackResult.payload.script, repairedScript);
  assert.equal(fallbackRequests.length, 2);
  assert.equal(fullFallbackReviews, 2);
  const fallbackRepairPrompt = fallbackRequests[1].messages.at(-1).content;
  assert.ok(fallbackRepairPrompt.includes(bridgeIssue));
  assert.match(fallbackRepairPrompt, /Предложение 2, 27 слов:/u);
  console.log("Creative preflight regression passed: Ref 956, joint feedback, sentence packing, exact speech, bounded two-attempt repairs.");

  async function simulate(candidates, responses) {
    const requests = [], reviews = [], usage = [];
    global.fetch = async (url, options) => {
      assert.equal(String(url), "https://openrouter.ai/api/v1/chat/completions", "only mocked semantic review is permitted");
      assert.ok(reviews.length < 2, "semantic reviewer must keep the two-call ceiling");
      const body = JSON.parse(options.body);
      const response = responses[reviews.length];
      assert.ok(response, "unexpected semantic call");
      reviews.push(body);
      return { ok: true, json: async () => ({ model: input.model, choices: [{ message: { content: JSON.stringify(response) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }) };
    };
    try {
      const result = await copywriter.runCreativeCopywriter(input, (record) => usage.push(record), async (request) => {
        assert.ok(requests.length < 2, "writer must keep the two-call ceiling");
        if (requests.length === 1) assert.equal(reviews.length, 1, "semantic issues must be known before repair starts");
        requests.push(request);
        return candidates[request.attempt - 1];
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
