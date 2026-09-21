import pool from "@/lib/db";
import { ensureOmniSchema } from "./schema";

/**
 * Product topic axes: the structured "what to talk about" extracted once per
 * product (benefits, audiences, objections, use cases). References stay out of
 * this layer — they own the "how", the card owns the "what".
 */

export type TopicAxes = {
  benefits: Array<{ title: string; detail: string }>;
  audiences: Array<{ title: string; concern: string }>;
  objections: string[];
  use_cases: string[];
};

export type TopicAxesRequest = (input: { userPrompt: string }) => Promise<string>;

const AXES_ATTEMPTS = 2;

export function buildTopicAxesPrompt(productCard: {
  name: string;
  description: string | null;
  notes: string | null;
  visual_summary: string | null;
  physical_contract: string | null;
}) {
  return [
    "Ты — контент-стратег продукта для коротких вертикальных роликов.",
    "Разбери продукт на оси тем для генерации сценариев.",
    "",
    "КАРТОЧКА ПРОДУКТА:",
    `- Название: ${productCard.name}`,
    productCard.description ? `- Описание: ${productCard.description}` : null,
    productCard.notes ? `- Заметки: ${productCard.notes}` : null,
    productCard.visual_summary ? `- Внешний вид: ${productCard.visual_summary}` : null,
    productCard.physical_contract ? `- Физические свойства: ${productCard.physical_contract}` : null,
    "",
    "Верни только валидный JSON без markdown:",
    JSON.stringify({
      benefits: [{ title: "короткое название выгоды (до 5 слов)", detail: "одно предложение specifics" }],
      audiences: [{ title: "кто это (до 4 слов)", concern: "главная боль этой аудитории" }],
      objections: ["частое возражение или миф"],
      use_cases: ["ситуация использования"],
    }),
    "",
    "Требования: 5-8 выгод, 3-6 аудиторий, 3-5 возражений, 4-6 ситуаций. Пиши по-русски. Только то, что следует из карточки; не выдумывай свойства.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

function cleanList(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .slice(0, maxItems);
}

function cleanString(value: unknown, max = 160) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : "";
}

function cleanStringList(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanString(item, 200))
    .filter(Boolean)
    .slice(0, maxItems);
}

export function normalizeTopicAxes(raw: string): TopicAxes {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(trimmed) as Record<string, unknown>;
  const benefits = cleanList(parsed.benefits, 8)
    .map((item) => ({ title: cleanString(item.title, 80), detail: cleanString(item.detail) }))
    .filter((item) => item.title && item.detail);
  const audiences = cleanList(parsed.audiences, 6)
    .map((item) => ({ title: cleanString(item.title, 80), concern: cleanString(item.concern) }))
    .filter((item) => item.title && item.concern);
  const objections = cleanStringList(parsed.objections, 5);
  const useCases = cleanStringList(parsed.use_cases, 6);
  if (benefits.length < 2 || audiences.length < 2) {
    throw new Error("Topic axes need at least 2 benefits and 2 audiences");
  }
  return { benefits, audiences, objections, use_cases: useCases };
}

export async function composeTopicAxes(input: {
  productCard: Parameters<typeof buildTopicAxesPrompt>[0];
  request: TopicAxesRequest;
}) {
  const prompt = buildTopicAxesPrompt(input.productCard);
  let lastError = "";
  for (let attempt = 1; attempt <= AXES_ATTEMPTS; attempt += 1) {
    const content = await input.request({ userPrompt: lastError ? `${prompt}\n\nПовторная попытка. Исправь: ${lastError}` : prompt });
    try {
      return normalizeTopicAxes(content);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`Topic axes extraction failed: ${lastError}`);
}

export async function defaultTopicAxesRequest(input: { userPrompt: string }) {
  const apiKey = process.env.OPENROUTER_API_KEY || "";
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");
  const model = process.env.SCENARIO_MODEL || "google/gemini-3.5-flash-lite";
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://n8n-omnireels.ap2dy7.easypanel.host",
      "X-Title": "Omni Reels Topic Axes",
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      max_tokens: 4_000,
      reasoning: { effort: "low" },
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Верни только валидный JSON без markdown." },
        { role: "user", content: input.userPrompt },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Topic axes request failed: ${response.status} ${text.slice(0, 200)}`);
  }
  const data = (await response.json()) as Record<string, unknown>;
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const message = choices[0] && typeof choices[0] === "object" && !Array.isArray(choices[0])
    ? (choices[0] as { message?: { content?: unknown } }).message
    : null;
  const content = message && typeof message.content === "string" ? message.content : "";
  if (!content) throw new Error("Topic axes request returned no content");
  return content;
}

const AXES_SCHEMA_STATEMENTS = [
  "ALTER TABLE omni_products ADD COLUMN IF NOT EXISTS topic_axes JSONB",
  "ALTER TABLE omni_products ADD COLUMN IF NOT EXISTS topic_axes_updated_at TIMESTAMP",
];

let axesSchemaReady: Promise<void> | null = null;

async function ensureTopicAxesSchema() {
  if (!axesSchemaReady) {
    axesSchemaReady = (async () => {
      for (const statement of AXES_SCHEMA_STATEMENTS) {
        await pool.query(statement);
      }
    })().catch((error) => {
      axesSchemaReady = null;
      throw error;
    });
  }
  return axesSchemaReady;
}

export async function getCachedTopicAxes(productId: number) {
  await ensureOmniSchema();
  await ensureTopicAxesSchema();
  const { rows } = await pool.query<{ topic_axes: TopicAxes | null; topic_axes_updated_at: string | null }>(
    "SELECT topic_axes, topic_axes_updated_at FROM omni_products WHERE id = $1 LIMIT 1",
    [productId]
  );
  const row = rows[0];
  if (!row?.topic_axes?.benefits?.length || !row?.topic_axes?.audiences?.length) return null;
  return { axes: row.topic_axes, updatedAt: row.topic_axes_updated_at };
}

export async function saveTopicAxes(productId: number, axes: TopicAxes) {
  await ensureOmniSchema();
  await ensureTopicAxesSchema();
  await pool.query(
    `UPDATE omni_products
     SET topic_axes = $2::jsonb, topic_axes_updated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [productId, JSON.stringify(axes)]
  );
}
