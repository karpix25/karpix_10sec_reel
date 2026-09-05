import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire, Module } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ui = resolve(import.meta.dirname, "../ui");
const output = mkdtempSync(join(tmpdir(), "omni-product-integration-"));
const require = createRequire(import.meta.url);
const originalLoad = Module._load;
const originalFetch = global.fetch;
const originalKey = process.env.OPENROUTER_API_KEY;
const requests = [];
const usage = [];

// Synthetic shopping example; no claim about the full rejected Ref #953 text.
const script = "Где купить одежду в Нячанге и чем оплатить покупки? В магазине из подборки есть летние рубашки. "
  + "Для покупки понадобится способ оплаты. Карта Пример помогает оплачивать покупки за границей. Ссылка в профиле. Способ оплаты подготовлен заранее.";
const input = {
  model: "test/model", projectName: "Тест", productName: "Карта Пример",
  productDescription: "Помогает оплачивать покупки за границей.",
  productReferenceNotes: null, targetAudience: null, brandVoice: null,
  ctaMode: "link_in_profile", ctaValue: null, avatarSpeechGender: "male",
  sourceScenario: { script: "Где купить одежду в Нячанге? В магазине из подборки есть летние рубашки." },
  adaptationPlan: {
    version: "script-adaptation-v1", mode: "writer_owned", reason: "Адаптация сценаристом",
    preserve: ["Подборка одежды"], replace: [], productBridge: "Потребность в оплате покупок",
  },
};
const accepted = {
  evidence: {
    product: "Карта Пример", value: "помогает оплачивать покупки за границей",
    transition: "Для покупки понадобится способ оплаты.",
    answer: "В магазине из подборки есть летние рубашки.",
    referenceAnswer: "В магазине из подборки есть летние рубашки.",
    expectedAnswer: "летние рубашки", answerKind: "explanation",
  },
  defects: [], warnings: [],
};
let modelReview = accepted;

try {
  const config = join(output, "tsconfig.json");
  writeFileSync(config, JSON.stringify({
    compilerOptions: {
      target: "es2022", module: "commonjs", moduleResolution: "node",
      rootDir: join(ui, "src"), outDir: output,
      baseUrl: ui, paths: { "@/*": ["src/*"] },
      strict: true, esModuleInterop: true, skipLibCheck: true,
      types: ["node"], typeRoots: [join(ui, "node_modules/@types")],
    },
    files: ["script-semantic-reviewer.ts", "script-prompt-helper.ts", "llm-prompt-chain-creative-repair.ts"]
      .map((name) => join(ui, "src/lib/server/omni", name)),
  }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", config], { cwd: ui, stdio: "inherit" });
  Module._load = function (request, parent, isMain) {
    if (request === "./openrouter-pricing") return { getOpenRouterPricingSnapshot: async () => null };
    if (request.startsWith("@/")) return originalLoad.call(this, join(output, request.slice(2)), parent, isMain);
    return originalLoad.call(this, request, parent, isMain);
  };
  process.env.OPENROUTER_API_KEY = "local-test-key";
  global.fetch = async (url, options) => {
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions", "no other network request is allowed");
    requests.push(JSON.parse(options.body));
    return new Response(JSON.stringify({
      model: "test/model", choices: [{ message: { content: JSON.stringify(modelReview) } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }), { status: 200 });
  };
  const load = (name) => require(join(output, "lib/server/omni", name + ".js"));
  const { SCRIPT_PRODUCT_INTEGRATION_CONTRACT: contract } = load("script-product-integration-contract");
  const { buildCreativeCopywriterPrompt } = load("llm-prompt-chain-prompts");
  const { buildCreativeCopywriterAttemptPrompt } = load("llm-prompt-chain-creative-repair");
  const { buildPrompt } = load("script-prompt-helper");
  const reviewer = load("script-semantic-reviewer");
  const reviewInput = { ...input, script, referenceScript: input.sourceScenario.script };
  const review = await reviewer.reviewScriptSemantics(reviewInput, (record) => usage.push(record));
  assert.equal(review.passed, true);
  assert.doesNotThrow(() => reviewer.assertScriptSemanticReviewPassed(review));

  const rejection = { ...review, passed: false, issues: ["Потерян ответ."], repairInstructions: ["Верни ответ из оригинала."] };
  const repair = buildCreativeCopywriterAttemptPrompt({
    chainInput: input, attempt: 2, maxAttempts: 2,
    previousDraft: { version: "llm-prompt-chain-v1", script, hookAngle: null, creativeNotes: null },
    semanticReview: rejection, failureReason: rejection.issues[0],
  });
  assert.equal(repair.mode, "targeted_repair");
  assert.ok(repair.prompt.includes(script), "repair must receive the rejected draft");
  assert.ok(repair.prompt.includes(rejection.repairInstructions[0]), "repair must receive the specific missing-bridge feedback");
  const system = requests[0].messages.find((message) => message.role === "system").content;
  const user = requests[0].messages.find((message) => message.role === "user").content;
  for (const [name, prompt] of [
    ["creative writer", buildCreativeCopywriterPrompt(input)],
    ["fallback writer", buildPrompt(input)],
    ["targeted repair", repair.prompt],
    ["actual reviewer request", system],
  ]) {
    assert.ok(prompt.includes(contract), `${name} must use the same integration criterion`);
    assert.doesNotMatch(prompt, /можно удалить без потери/iu, `${name} must not reject removable but useful adjacent integration`);
    assert.match(prompt, /потребность может быть обозначена уже в хуке/iu);
    assert.match(prompt, /остаются полезными без продуктовой фразы/iu);
  }
  assert.ok(user.includes(script), "reviewer must inspect the complete submitted script");
  assert.match(system, /точные непрерывные цитаты/iu);
  assert.match(system, /НЕ блокирующие смысловые дефекты/u);

  modelReview = { ...accepted, warnings: ["Продукт встроен искусственно, его можно удалить."] };
  const stylistic = await reviewer.reviewScriptSemantics(reviewInput, () => {});
  assert.equal(stylistic.passed, true, "stylistic advice cannot block a usable rewrite");
  assert.equal(stylistic.warnings.length, 1);

  modelReview = { ...accepted, evidence: { ...accepted.evidence, transition: "" } };
  const missingEvidence = await reviewer.reviewScriptSemantics(reviewInput, () => {});
  assert.equal(missingEvidence.passed, true, "missing editorial transition evidence is not a factual defect");

  modelReview = { ...accepted, defects: [{ code: "unsupported_product_claim", message: "Выдача наличных не подтверждена описанием продукта.", scriptQuote: "С картой можно снимать наличные в банкомате.", expectedText: "снимать наличные", referenceQuote: "" }] };
  const unsupported = await reviewer.reviewScriptSemantics({
    ...reviewInput, script: script + " С картой можно снимать наличные в банкомате.",
  }, () => {});
  assert.equal(unsupported.passed, false, "unsupported product capability must still override a model pass");
  assert.match(unsupported.issues.join(" "), /снимать наличные/u);
  assert.ok(unsupported.repairInstructions[0].includes("снимать наличные"));
  assert.equal(requests.length, 4, "one bounded semantic request per review; no new provider stages");
  assert.equal(usage[0].layer, "script_semantic_reviewer");
  console.log("Product integration prompts: shared policy, exact review payload, targeted repair, and rejection guards passed (mocked API).");
} finally {
  Module._load = originalLoad;
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalKey;
  rmSync(output, { recursive: true, force: true });
}
