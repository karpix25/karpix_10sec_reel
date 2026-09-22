import { normalizeOpenRouterUsage, type OpenRouterUsageRecord } from "@/lib/omni/openrouter-cost";
import { getOpenRouterPricingSnapshot } from "./openrouter-pricing";
import { parseAndRepairJson } from "./script-json-repair";

export type UnifiedSemanticPreservationReview = {
  passed: boolean;
  defects: string[];
  repairInstructions: string[];
  evidence: { preservedTopic: string; preservedHook: string; preservedLogic: string; productBridge: string };
};

export async function reviewUnifiedSemanticPreservation(input: {
  model: string;
  parsed: Record<string, unknown>;
  script: string;
  productName: string;
  attempt: number;
  onUsage: (usage: OpenRouterUsageRecord) => void;
}): Promise<UnifiedSemanticPreservationReview> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");
  const referenceAnalysis = isRecord(input.parsed.reference_analysis) ? input.parsed.reference_analysis : {};
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://n8n-omnireels.ap2dy7.easypanel.host",
      "X-Title": "Omni Reels Semantic Preservation QA",
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0,
      max_tokens: 2_500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Ты независимый senior-редактор UGC. Проверяй смысловую верность адаптации строго по данным reference. Верни только JSON." },
        { role: "user", content: buildReviewPrompt({ ...input, referenceAnalysis }) },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`Semantic preservation QA failed: HTTP ${response.status}`);
  const data = await response.json() as Record<string, unknown>;
  const pricing = await getOpenRouterPricingSnapshot(String(data.model || input.model));
  input.onUsage(normalizeOpenRouterUsage({
    layer: "script_semantic_reviewer", model: input.model, response: data, attempt: input.attempt, pricing,
  }));
  const content = readAssistantContent(data);
  if (!content) throw new Error("Semantic preservation QA returned empty content");
  const parsed = parseAndRepairJson<Record<string, unknown>>(content);
  const defects = readStringArray(parsed.defects);
  const repairInstructions = readStringArray(parsed.repair_instructions ?? parsed.repairInstructions);
  const evidence = isRecord(parsed.evidence) ? parsed.evidence : {};
  return {
    passed: parsed.passed === true && defects.length === 0,
    defects,
    repairInstructions,
    evidence: {
      preservedTopic: readString(evidence.preserved_topic ?? evidence.preservedTopic),
      preservedHook: readString(evidence.preserved_hook ?? evidence.preservedHook),
      preservedLogic: readString(evidence.preserved_logic ?? evidence.preservedLogic),
      productBridge: readString(evidence.product_bridge ?? evidence.productBridge),
    },
  };
}

function buildReviewPrompt(input: {
  parsed: Record<string, unknown>;
  script: string;
  productName: string;
  referenceAnalysis: Record<string, unknown>;
}) {
  return [
    "Проверь, сохранил ли новый сценарий содержательную основу reference, а не только стиль, локацию или первую фразу.",
    "Блокирующие дефекты: конкретная тема стала общей/соседней/рекламной; хук ведёт к другому ответу; исчезли существенные аргументы или вывод; продукт заменил историю; adaptation_trace ложно объявляет бит сохранённым.",
    "Не требуй дословного копирования и не блокируй естественное перефразирование. Визуальный стиль здесь не оценивай.",
    "CTA обязателен по настройкам продукта: не требуй удалить CTA. Если он резкий, потребуй органичный переход и мягкую формулировку, сохранив сам CTA.",
    "Верни: {\"passed\":boolean,\"defects\":[\"точный дефект\"],\"repair_instructions\":[\"конкретное исправление\"],\"evidence\":{\"preserved_topic\":\"цитата или пусто\",\"preserved_hook\":\"цитата или пусто\",\"preserved_logic\":\"цитата или пусто\",\"product_bridge\":\"цитата или пусто\"}}.",
    `Название нашего продукта: ${input.productName}`,
    `REFERENCE ANALYSIS:\n${JSON.stringify(input.referenceAnalysis)}`,
    `REFERENCE TRANSCRIPT:\n${readString(input.parsed.spoken_transcript)}`,
    `ADAPTATION TRACE:\n${JSON.stringify(input.parsed.adaptation_trace ?? null)}`,
    `NEW SCRIPT:\n${input.script}`,
  ].join("\n\n");
}

function readAssistantContent(data: Record<string, unknown>) {
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const choice = isRecord(choices[0]) ? choices[0] : {};
  const message = isRecord(choice.message) ? choice.message : {};
  return readString(message.content);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(readString).filter(Boolean) : [];
}
