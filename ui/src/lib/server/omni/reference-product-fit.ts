import type { OmniLegacyScenario } from "@/lib/omni/types";
import type { ReferenceProductFit } from "./generated-script-reference-selection";
import { parseAndRepairJson } from "./script-json-repair";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 30_000;

export async function reviewReferenceProductFit(input: {
  model: string;
  sourceScenario: OmniLegacyScenario;
  productName: string;
  productDescription: string | null;
  productReferenceNotes: string | null;
}): Promise<ReferenceProductFit> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() || "";
  if (!apiKey) return { compatible: true, reason: "product fit review unavailable" };

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://n8n-omnireels.ap2dy7.easypanel.host",
        "X-Title": "Omni Reels Reference Product Fit",
      },
      body: JSON.stringify({
        model: input.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: REFERENCE_PRODUCT_FIT_PROMPT },
          { role: "user", content: buildReferenceProductFitPrompt(input) },
        ],
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json() as Record<string, unknown>;
    return normalizeFit(parseAndRepairJson(readAssistantContent(data)));
  } catch (error) {
    console.warn("Omni reference product fit review unavailable:", error);
    return { compatible: true, reason: "product fit review unavailable" };
  }
}

export const REFERENCE_PRODUCT_FIT_PROMPT = [
  "Ты отбираешь reference-видео для нативной адаптации под продукт.",
  "Верни только JSON: compatible и reason.",
  "compatible true, если реальная функция продукта естественно продолжает существующую потребность, действие, список, платный шаг или вывод reference.",
  "Для продукта оплаты за границей совместимы references, где уже обсуждаются цены, бюджет, бронирование, туры, отели, билеты, транспорт, еда, покупки или другие оплачиваемые действия в поездке. Продукт может быть одним практическим шагом и не обязан решать главный тезис целиком.",
  "Если для связи нужно придумать новую проблему, ложную причинность или резко сменить тему на рекламу, compatible false.",
  "Одинаковая страна, аудитория или широкая тема путешествий без платного действия сами по себе не доказывают совместимость. Не утверждай, что карта решает посторонний закон, запрет, визу, погоду или выбор места.",
  "Чужой продукт можно заменить нашим только при совпадающей сценарной роли и совместимой реальной функции.",
  "compatible false, если hook или обещание reference не получает ответа в самой транскрибации и для завершения пришлось бы угадывать факт из картинки, подписи или комментариев.",
  "Не оценивай качество съёмки, длину, CTA или формулировки будущего сценария.",
].join("\n");

function buildReferenceProductFitPrompt(input: {
  sourceScenario: OmniLegacyScenario;
  productName: string;
  productDescription: string | null;
  productReferenceNotes: string | null;
}) {
  return [
    `Продукт: ${input.productName}`,
    `Описание: ${input.productDescription || "не указано"}`,
    `Заметки: ${input.productReferenceNotes || "не указаны"}`,
    `Тема reference: ${input.sourceScenario.topic || "не указана"}`,
    `Заголовок reference: ${input.sourceScenario.title || "не указан"}`,
    "Транскрибация reference:",
    input.sourceScenario.script,
  ].join("\n");
}

function normalizeFit(value: unknown): ReferenceProductFit {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    compatible: record.compatible === true,
    reason: typeof record.reason === "string" && record.reason.trim()
      ? record.reason.trim()
      : "model did not confirm product compatibility",
  };
}

function readAssistantContent(data: Record<string, unknown>) {
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const first = choices[0];
  const message = first && typeof first === "object" && !Array.isArray(first)
    ? (first as Record<string, unknown>).message
    : null;
  const content = message && typeof message === "object" && !Array.isArray(message)
    ? (message as Record<string, unknown>).content
    : null;
  if (typeof content === "string" && content.trim()) return content;
  throw new Error("Reference product fit model returned empty content");
}
