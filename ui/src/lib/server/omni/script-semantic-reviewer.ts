import type { OpenRouterUsageRecord } from "@/lib/omni/openrouter-cost";
import { normalizeOpenRouterUsage } from "@/lib/omni/openrouter-cost";
import type { CtaMode } from "@/lib/omni/creative-contract";
import type { DirectorBrief } from "./director-analysis-types";
import type { ScriptSemanticReview } from "./llm-prompt-chain-types";
import { getOpenRouterPricingSnapshot } from "./openrouter-pricing";
import { parseAndRepairJson } from "./script-json-repair";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 45_000;
const REVIEW_VERSION = "script-semantic-review-v1" as const;

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

  return normalizeScriptSemanticReview(parseAndRepairJson(readAssistantContent(data)));
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
  "finalAnswerPresent означает, что главный вопрос или тезис исходного reference получает завершенный вывод.",
  "referenceMeaningPreserved означает сохранение тезиса, причинной связи, доказательства или примера и финального вывода исходного reference без подмены смысла.",
  "productNaturallyIntegrated означает, что продукт является практическим решением мысли, а не внезапной рекламной вставкой.",
  "Не требуй дословного совпадения с reference. Не придумывай факты, которых нет в описании продукта.",
  "passed разрешен только если все шесть смысловых проверок true.",
].join("\n");

function buildReviewPrompt(input: ScriptSemanticReviewInput) {
  return [
    "Проверь этот сценарий.",
    "Верни JSON строго с полями: passed, productNamed, productValueStated, hookAnswered, finalAnswerPresent, productNaturallyIntegrated, referenceMeaningPreserved, evidence, issues, repairInstructions.",
    "В evidence.product приведи короткую цитату с явным названием продукта. Если продукт не назван, оставь пустую строку.",
    "В evidence.value приведи короткую цитату, где объясняется польза продукта. В evidence.answer приведи финальный ответ на главный вопрос или тезис.",
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
    productNaturallyIntegrated: Boolean(record.productNaturallyIntegrated ?? record.product_naturally_integrated),
    referenceMeaningPreserved: Boolean(record.referenceMeaningPreserved ?? record.reference_meaning_preserved),
    evidence: {
      product: readText(evidence.product),
      value: readText(evidence.value),
      answer: readText(evidence.answer),
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
  return { ...review, passed: review.passed && allChecksPass };
}

function readAssistantContent(data: Record<string, unknown>) {
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const firstChoice = choices[0];
  const message = isRecord(firstChoice) && isRecord(firstChoice.message) ? firstChoice.message : null;
  if (message && typeof message.content === "string" && message.content.trim()) return message.content;
  throw new Error("Script semantic review model returned empty content");
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
