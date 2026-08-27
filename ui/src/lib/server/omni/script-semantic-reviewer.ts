import type { OpenRouterUsageRecord } from "@/lib/omni/openrouter-cost";
import { normalizeOpenRouterUsage } from "@/lib/omni/openrouter-cost";
import type { CtaMode } from "@/lib/omni/creative-contract";
import type { DirectorBrief } from "./director-analysis-types";
import type { ScriptSemanticReview } from "./llm-prompt-chain-types";
import { getOpenRouterPricingSnapshot } from "./openrouter-pricing";
import { parseAndRepairJson } from "./script-json-repair";
import { assertCtaConclusionContract } from "./script-quality-contract";
import {
  renderScriptAdaptationReviewContract,
  type ScriptAdaptationPlan,
} from "./script-adaptation-contract";
import {
  buildLegacyScriptContentContract,
  renderScriptContentContract,
  type ScriptContentContract,
} from "./script-content-contract";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 45_000;
const REVIEW_VERSION = "script-semantic-review-v1" as const;
const PRODUCT_CAPABILITY_RULES = [
  { label: "оплату по QR", script: /\bqr\b|куар|сканир\w*\s+(?:qr|код)/iu, source: /\bqr\b|куар|сканир\w*\s+(?:qr|код)/iu },
  { label: "снятие или выдачу наличных", script: /банкомат|снят\w*\s+налич|выдач\w*\s+налич/iu, source: /банкомат|снят\w*\s+налич|выдач\w*\s+налич/iu },
  {
    label: "гарантированную скидку, местную цену или защиту от наценки",
    script: /(?:с\s+ней|с\s+(?:этой\s+)?картой|плати\s+по\s+миру|виртуальн\w*\s+карт\w*)[^.!?]{0,160}(?:как\s+местн|цен\w*[^.!?]{0,30}(?:не\s+буд\w*\s+завыш|ниже)|не\s+переплач|скидк|выгодн\w*\s+курс)|(?:не\s+плат[а-яё]*\s+лишн|не\s+переплач|избеж[а-яё]*\s+переплат)[^.!?]{0,160}(?:плати\s+по\s+миру|виртуальн\w*\s+карт\w*)/iu,
    source: /скидк|кэшбэк|выгодн\w*\s+курс|местн\w*\s+цен|защит\w*\s+от\s+нацен|не\s+переплач/iu,
  },
  {
    label: "гарантированную оплату в любой стране или где угодно",
    script: /(?:с\s+ней|с\s+(?:этой\s+)?картой|плати\s+по\s+миру|виртуальн\w*\s+карт\w*)[^.!?]{0,160}(?:в\s+любой\s+стран|по\s+всему\s+миру|где\s+угодно|везде)/iu,
    source: /в\s+любой\s+стран|по\s+всему\s+миру|где\s+угодно|везде/iu,
  },
] as const;

export type ScriptSemanticReviewInput = {
  model: string;
  script: string;
  referenceScript: string;
  productName: string;
  productDescription: string | null;
  productReferenceNotes: string | null;
  ctaMode: CtaMode;
  ctaValue: string | null;
  directorBrief?: DirectorBrief | null;
  adaptationPlan: ScriptAdaptationPlan;
  contentContract?: ScriptContentContract;
};

export async function reviewScriptSemantics(
  input: ScriptSemanticReviewInput,
  onUsage: (usage: OpenRouterUsageRecord) => void,
  attempt = 1,
): Promise<ScriptSemanticReview> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() || "";
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://n8n-omnireels.ap2dy7.easypanel.host",
      "X-Title": "Omni Reels Script Semantic Review",
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SEMANTIC_REVIEW_SYSTEM_PROMPT },
        { role: "user", content: buildReviewPrompt(input) },
      ],
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Script semantic review failed: ${response.status} ${text.slice(0, 240)}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const pricing = await getOpenRouterPricingSnapshot(String(data.model || input.model));
  onUsage(normalizeOpenRouterUsage({
    layer: "script_semantic_reviewer",
    model: input.model,
    response: data,
    attempt,
    pricing,
  }));

  const capabilityReview = reconcileProductCapabilities(
    normalizeScriptSemanticReview(parseAndRepairJson(readAssistantContent(data))),
    input.script,
    input.productDescription,
    input.productReferenceNotes,
  );
  return reconcileSemanticConclusion(
    capabilityReview,
    input.script,
    input.ctaMode,
  );
}

export function reconcileProductCapabilities(
  review: ScriptSemanticReview,
  script: string,
  productDescription: string | null,
  productReferenceNotes: string | null,
): ScriptSemanticReview {
  const source = [productDescription, productReferenceNotes].filter(Boolean).join(" ");
  const unsupported = PRODUCT_CAPABILITY_RULES
    .filter((rule) => rule.script.test(script) && !rule.source.test(source))
    .map((rule) => rule.label);
  if (!unsupported.length) return review;
  const issue = `Сценарий приписывает продукту неподтвержденную возможность: ${unsupported.join(", ")}.`;
  return {
    ...review,
    passed: false,
    productValueStated: false,
    productNaturallyIntegrated: false,
    issues: [...review.issues, issue],
    repairInstructions: [
      ...review.repairInstructions,
      "Удалите неподтвержденное действие и используйте только возможности из описания продукта.",
    ],
  };
}

export function reconcileSemanticConclusion(
  review: ScriptSemanticReview,
  script: string,
  ctaMode: string,
): ScriptSemanticReview {
  if (review.finalAnswerPresent || !hasDeterministicCtaConclusion(script, ctaMode)) return review;
  const patched = {
    ...review,
    finalAnswerPresent: true,
    issues: review.issues.filter((item) => !isConclusionOnlyFeedback(item)),
    repairInstructions: review.repairInstructions.filter((item) => !isConclusionOnlyFeedback(item)),
  };
  return {
    ...patched,
    passed: [
      patched.productNamed,
      patched.productValueStated,
      patched.hookAnswered,
      patched.finalAnswerPresent,
      patched.productNaturallyIntegrated,
      patched.referenceMeaningPreserved,
    ].every(Boolean),
  };
}

export function assertScriptSemanticReviewPassed(review: ScriptSemanticReview) {
  if (review.passed) return;
  const issues = review.issues.length ? review.issues.join("; ") : "LLM не подтвердил смысловую целостность сценария";
  const repairs = review.repairInstructions.length
    ? ` Исправь: ${review.repairInstructions.join("; ")}.`
    : "";
  throw new Error(`Сценарий отклонен: смысловая LLM-проверка. ${issues}.${repairs}`);
}

export const SEMANTIC_REVIEW_SYSTEM_PROMPT = [
  "Ты строгий редактор сценариев коротких видео.",
  "Проверь готовый русский voiceover по смыслу, а не по ключевым словам.",
  "Верни только JSON указанной формы.",
  "Название продукта должно быть произнесено явно. Фраза «ссылка в профиле», «ссылка в описании» или похожий CTA никогда не считается названием продукта.",
  "productValueStated означает, что зрителю понятно, какую конкретную задачу продукта решают в этом ролике.",
  "hookAnswered означает, что обещание, вопрос или интрига первой части получают конкретный ответ внутри сценария, а не только CTA.",
  "finalAnswerPresent означает, что новый продуктовый тезис получает отдельный утвердительный вывод после последнего CTA. В режиме format_transfer вывод относится к новой продуктовой теме, а не к исходному предмету reference. Вопрос, приказ или новый призыв, включая «забудь», «наслаждайся», «путешествуй», «попробуй» и «хочешь так же», не считаются выводом.",
  "referenceMeaningPreserved означает, что в режимах preserve_reference и adjacent_bridge новый сценарий сохраняет тему, хук, главный вопрос или конфликт, угол подачи, ключевые примеры, темп и последовательное раскрытие мысли reference, но честно адаптирует ответ под продукт. В режиме format_transfer проверь только переносимую форму хука, личную подачу, темп, структуру и тип раскрытия; не требуй сохранения исходного предмета, механизма или ответа. Не требуй, чтобы продукт притворно отвечал на чужой исходный вопрос.",
  "Если reference явно обещает количество советов, шагов или ошибок, проверь, что сценарий сохраняет это количество и каждый пункт по смыслу. Если reference не обещает список и деталь второстепенна, не требуй сохранять весь текст или несколько примеров: одного конкретного факта достаточно, если главный ответ и логика reference не потеряны.",
  "Сокращение, объединение и перестановка примеров сами по себе не являются подменой смысла. Не отклоняй полезный сценарий только потому, что в нем меньше деталей, чем в reference.",
  "Не требуй сохранять чужой CTA, канал, ссылку, скидку, лид-магнит или место публикации из reference. Они заменяются текущим CTA продукта и не являются смысловым выводом reference.",
  "Перед false по hookAnswered или referenceMeaningPreserved дословно проверь, нет ли обещанного названия, страны, цены или ответа в готовом сценарии. Если факт назван, нельзя писать, что он отсутствует.",
  "productNaturallyIntegrated означает причинную и нативную интеграцию продукта в текущую мысль. В новом сценарии должна быть конкретная потребность, выбор или проблема, на которую продукт отвечает как инструмент, пример или решение. Перед продуктом должен быть понятный причинный мостик, а польза должна быть объяснена именно для этой ситуации. Если предложение о продукте можно удалить без потери логики или пользы, проверка false. Отдельная рекламная вставка и внезапное упоминание считаются ошибкой.",
  "Режим CTA из входных данных обязателен. Не принимай упоминание описания, комментариев или другого канала, если выбран режим ссылки в профиле; не принимай ссылку в профиле, если выбран другой режим.",
  "Интеграция должна приписывать продукту только подтвержденную пользу. Нельзя утверждать, что карта предотвращает штраф, отменяет закон, выдает визу, гарантирует скидку или особый курс. Допустимо сказать, что карта помогает оплачивать покупки и услуги за границей.",
  "Не оценивай длину, число слов, формат JSON, пунктуацию или технические ограничения. Их проверяют отдельные детерминированные валидаторы.",
  "Не требуй дословного совпадения с reference. Не придумывай факты, которых нет в описании продукта.",
  "В repairInstructions предлагай только декларативный финальный вывод. Не предлагай вопрос, приказ, CTA или императив вроде «не упустите», «посетите», «попробуйте».",
  "passed разрешен только если все шесть смысловых проверок true.",
].join("\n");

function buildReviewPrompt(input: ScriptSemanticReviewInput) {
  const contentContract = input.contentContract || buildLegacyScriptContentContract(input.referenceScript, input.adaptationPlan);
  const referenceReviewRule = contentContract.adaptation.mode === "format_transfer"
    ? "В режиме format_transfer не требуй сохранения темы или ответа исходного reference. Проверь форму хука, личную подачу, темп, структуру раскрытия и последовательность нового продуктового тезиса."
    : "Сохрани тему, форму хука, главный конфликт, личную подачу, ключевые примеры и структуру reference. Если продукт не отвечает на исходный вопрос напрямую, проверь естественный переход от темы к проблеме, которую продукт действительно решает.";
  return [
    "Проверь этот сценарий.",
    "Верни JSON строго с полями: passed, productNamed, productValueStated, hookAnswered, finalAnswerPresent, productNaturallyIntegrated, referenceMeaningPreserved, evidence, issues, repairInstructions.",
    "В evidence.product приведи короткую цитату с явным названием продукта. Если продукт не назван, оставь пустую строку.",
    "В evidence.value приведи короткую цитату, где объясняется польза продукта. В evidence.transition приведи короткую цитату или опиши причинный мостик от проблемы, выбора или потребности нового сценария к продукту. Если мостика нет, оставь пустую строку. В evidence.answer приведи финальный продуктовый вывод.",
    "issues и repairInstructions должны быть короткими русскими строками. Если нарушений нет, верни пустые массивы.",
    "",
    `Продукт: ${input.productName}`,
    `Описание продукта: ${input.productDescription || "не указано"}`,
    `Заметки по продукту: ${input.productReferenceNotes || "не указаны"}`,
    `Режим CTA: ${input.ctaMode}; значение CTA: ${input.ctaValue || "не указано"}`,
    input.directorBrief ? `Наблюдения режиссерского анализа: ${renderDirectorSignals(input.directorBrief)}` : "",
    "",
    "Исходный reference transcript:",
    input.referenceScript.trim() || "не предоставлен",
    "",
    renderScriptContentContract(contentContract),
    renderScriptAdaptationReviewContract(contentContract.adaptation),
    "",
    referenceReviewRule,
    "",
    "Готовый сценарий:",
    input.script.trim(),
  ].filter(Boolean).join("\n");
}

function renderDirectorSignals(brief: DirectorBrief) {
  return [
    brief.visual_hook.action,
    brief.visual_hook.retention_trigger,
    brief.reference_action_style,
    brief.reusable_mechanics.visual_mechanics.join("; "),
  ].filter(Boolean).join(". ");
}

function normalizeScriptSemanticReview(value: unknown): ScriptSemanticReview {
  const record = isRecord(value) ? value : {};
  const evidence = isRecord(record.evidence) ? record.evidence : {};
  const review = {
    version: REVIEW_VERSION,
    passed: Boolean(record.passed),
    productNamed: Boolean(record.productNamed ?? record.product_named),
    productValueStated: Boolean(record.productValueStated ?? record.product_value_stated),
    hookAnswered: Boolean(record.hookAnswered ?? record.hook_answered),
    finalAnswerPresent: Boolean(record.finalAnswerPresent ?? record.final_answer_present),
    productNaturallyIntegrated: Boolean(record.productNaturallyIntegrated ?? record.product_naturally_integrated) && Boolean(readText(evidence.transition)),
    referenceMeaningPreserved: Boolean(record.referenceMeaningPreserved ?? record.reference_meaning_preserved),
    evidence: {
      product: readText(evidence.product),
      value: readText(evidence.value),
      answer: readText(evidence.answer),
      transition: readText(evidence.transition),
    },
    issues: readTextArray(record.issues),
    repairInstructions: readTextArray(record.repairInstructions ?? record.repair_instructions),
  } satisfies ScriptSemanticReview;

  const allChecksPass = [
    review.productNamed,
    review.productValueStated,
    review.hookAnswered,
    review.finalAnswerPresent,
    review.productNaturallyIntegrated,
    review.referenceMeaningPreserved,
  ].every(Boolean);
  return { ...review, passed: allChecksPass };
}

function readAssistantContent(data: Record<string, unknown>) {
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const firstChoice = choices[0];
  const message = isRecord(firstChoice) && isRecord(firstChoice.message) ? firstChoice.message : null;
  if (message && typeof message.content === "string" && message.content.trim()) return message.content;
  throw new Error("Script semantic review model returned empty content");
}

function hasDeterministicCtaConclusion(script: string, ctaMode: string) {
  try {
    assertCtaConclusionContract(script, ctaMode);
    return true;
  } catch {
    return false;
  }
}

function isConclusionOnlyFeedback(value: string) {
  return /финальн(?:ый|ого|ом)\s+вывод|утвердительн(?:ый|ого|ом)\s+вывод|после\s+cta|заканчивается\s+(?:cta|призыв)/iu.test(value);
}

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readTextArray(value: unknown) {
  return Array.isArray(value) ? value.map(readText).filter(Boolean) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
