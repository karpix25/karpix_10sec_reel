import type { OpenRouterUsageRecord } from "@/lib/omni/openrouter-cost";
import { normalizeOpenRouterUsage } from "@/lib/omni/openrouter-cost";
import type { DirectorBrief } from "./director-analysis-types";
import type { ReferenceFormatMode } from "./omni-reference-format-mode";
import type { ReferenceSceneMode } from "./omni-reference-scene-mode";
import {
  renderSemanticStoryboardMemoryRules,
  type SemanticStoryboardMemoryRule,
} from "./semantic-storyboard-memory-contract";
import { getOpenRouterPricingSnapshot } from "./openrouter-pricing";
import { parseAndRepairJson } from "./script-json-repair";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 45_000;
const REVIEW_VERSION = "storyboard-plan-semantic-review-v1" as const;
const REVIEW_CACHE_LIMIT = 64;
const reviewCache = new Map<string, StoryboardPlanSemanticReview>();

export type StoryboardPlanSemanticReview = {
  version: typeof REVIEW_VERSION;
  passed: boolean;
  issues: { segmentIndex: number; code: string; explanation: string }[];
  repairInstructions: string[];
};

export type StoryboardPlanSemanticReviewInput = {
  model: string;
  script: string;
  productName: string;
  productDescription: string | null;
  productPhysicalContract?: string | null;
  directorBrief: DirectorBrief | null;
  referenceSceneMode: ReferenceSceneMode;
  referenceFormatMode: ReferenceFormatMode;
  learnedRules?: readonly SemanticStoryboardMemoryRule[];
  segments: readonly {
    index: number;
    voiceoverText: string;
    productRole: string;
    storyboardPlan: unknown;
  }[];
};

export async function reviewStoryboardPlanSemantics(
  input: StoryboardPlanSemanticReviewInput,
  onUsage?: (usage: OpenRouterUsageRecord) => void,
): Promise<StoryboardPlanSemanticReview> {
  const cacheKey = JSON.stringify(input);
  const cached = reviewCache.get(cacheKey);
  if (cached) return cached;

  const apiKey = process.env.OPENROUTER_API_KEY?.trim() || "";
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://n8n-omnireels.ap2dy7.easypanel.host",
      "X-Title": "Omni Reels Storyboard Plan Semantic Review",
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: STORYBOARD_PLAN_REVIEW_SYSTEM_PROMPT },
        { role: "user", content: buildReviewPrompt(input) },
      ],
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Storyboard plan semantic review failed: ${response.status} ${text.slice(0, 240)}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  if (onUsage) {
    const pricing = await getOpenRouterPricingSnapshot(String(data.model || input.model));
    onUsage(normalizeOpenRouterUsage({
      layer: "storyboard_semantic_reviewer",
      model: input.model,
      response: data,
      attempt: 1,
      pricing,
    }));
  }
  const review = normalizeReview(parseAndRepairJson(readAssistantContent(data)));
  if (reviewCache.size >= REVIEW_CACHE_LIMIT) reviewCache.delete(reviewCache.keys().next().value as string);
  reviewCache.set(cacheKey, review);
  return review;
}

export function assertStoryboardPlanSemanticReviewPassed(review: StoryboardPlanSemanticReview) {
  if (review.passed) return;
  const issues = review.issues.length
    ? review.issues.map((issue) => `сегмент ${issue.segmentIndex}: ${issue.explanation}`).join("; ")
    : "LLM не подтвердил соответствие раскадровки сценарию и референсу";
  const repair = review.repairInstructions.length
    ? ` Исправь раскадровку: ${review.repairInstructions.join("; ")}.`
    : "";
  throw new Error(`Раскадровка отклонена: смысловая LLM-проверка. ${issues}.${repair}`);
}

export const STORYBOARD_PLAN_REVIEW_SYSTEM_PROMPT = [
  "Ты строгий режиссерский редактор раскадровок коротких видео.",
  "Проверяй план по смыслу и по режиссерскому анализу референса, а не по наличию отдельных ключевых слов.",
  "Верни только JSON: {passed:boolean, issues:[{segmentIndex:number, code:string, explanation:string}], repairInstructions:string[]}.",
  "Отклоняй план, если выбранный render mode или layout не соответствует наблюдаемому reference format.",
  "Для voiceover B-roll и voiceover montage не разрешай превращать независимые перебивки в обычную говорящую голову.",
  "Текущий режиссерский анализ reference и product contract имеют приоритет над scoped learned memory; learned memory только дополняет их.",
  "Отклоняй случайные локации, персонажей, предметы и визуальные механики, которых нет в режиссерском анализе и которые не раскрывают текущую реплику.",
  "Когда voiceover прямо говорит о продукте, storyboard обязан поддерживать эту реплику видимым продуктом или согласованной демонстрацией. Фраза «продукт вне кадра» в этот момент является ошибкой.",
  "Финальный сегмент должен завершать главный тезис или отвечать на вопрос reference, а CTA не может быть единственным содержанием финала.",
  "repairInstructions формулируй как короткие положительные действия, без истории предыдущих проверок.",
  "Не блокируй обычную смену локации, одежды или камеры, если reference format явно voiceover montage и смена согласуется с timeline.",
  "Если данных недостаточно, не выдумывай нарушение и не блокируй по неопределенности.",
].join("\n");

function buildReviewPrompt(input: StoryboardPlanSemanticReviewInput) {
  return [
    `Продукт: ${input.productName}`,
    `Описание продукта: ${input.productDescription || "не указано"}`,
    `Текущий product contract: ${input.productPhysicalContract || "не указан"}`,
    `Reference scene mode: ${input.referenceSceneMode}`,
    `Reference format mode: ${input.referenceFormatMode}`,
    "Текущий режиссерский анализ reference, обязательный источник правды:",
    JSON.stringify(input.directorBrief || {}, null, 2),
    renderSemanticStoryboardMemoryRules(input.learnedRules),
    "Исходный сценарий:",
    input.script,
    "План сегментов:",
    JSON.stringify(input.segments, null, 2),
  ].join("\n\n");
}

function normalizeReview(value: unknown): StoryboardPlanSemanticReview {
  const record = isRecord(value) ? value : {};
  const rawIssues = Array.isArray(record.issues) ? record.issues : [];
  const issues = rawIssues.map((item) => {
    const issue = isRecord(item) ? item : {};
    return {
      segmentIndex: readPositiveInteger(issue.segmentIndex ?? issue.segment_index),
      code: readText(issue.code) || "storyboard_semantic_issue",
      explanation: readText(issue.explanation) || "Раскадровка не соответствует смысловому контракту.",
    };
  }).filter((issue) => issue.segmentIndex > 0);
  const normalized = {
    version: REVIEW_VERSION,
    passed: readBoolean(record.passed) && issues.length === 0,
    issues,
    repairInstructions: readTextArray(record.repairInstructions ?? record.repair_instructions),
  } satisfies StoryboardPlanSemanticReview;
  return normalized;
}

function readAssistantContent(data: Record<string, unknown>) {
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const firstChoice = choices[0];
  const message = isRecord(firstChoice) && isRecord(firstChoice.message) ? firstChoice.message : null;
  if (message && typeof message.content === "string" && message.content.trim()) return message.content;
  throw new Error("Storyboard plan semantic review model returned empty content");
}

function readBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";
  return false;
}

function readPositiveInteger(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
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
