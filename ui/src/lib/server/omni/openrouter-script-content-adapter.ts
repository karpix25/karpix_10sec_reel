import { normalizeOpenRouterUsage, type OpenRouterUsageRecord } from "@/lib/omni/openrouter-cost";
import { parseAndRepairJson } from "./script-json-repair";
import {
  normalizeScriptContentContract,
  type ScriptContentContract,
} from "./script-content-contract";
import {
  buildScriptContentAdapterPrompt,
  buildScriptContentAdapterRepairPrompt,
  SCRIPT_CONTENT_ADAPTER_PROMPT_VERSION,
  SCRIPT_CONTENT_ADAPTER_SYSTEM_PROMPT,
} from "./script-content-adapter-prompt";
import { getOpenRouterPricingSnapshot } from "./openrouter-pricing";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-3.5-flash-lite";
const REQUEST_TIMEOUT_MS = 90_000;
const MAX_ATTEMPTS = 5;

export type ScriptContentAdapterResult = {
  contract: ScriptContentContract;
  model: string;
  promptVersion: typeof SCRIPT_CONTENT_ADAPTER_PROMPT_VERSION;
  openRouterUsage: OpenRouterUsageRecord[];
  attemptCount: number;
};

export async function analyzeScriptContentAndAdapt(input: {
  transcript: string;
  title: string | null;
  topic: string | null;
  productName: string;
  productDescription: string | null;
  productReferenceNotes: string | null;
  model?: string | null;
}): Promise<ScriptContentAdapterResult> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() || "";
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");
  if (!input.transcript.trim()) throw new Error("Контентная адаптация невозможна без транскрипта reference");

  const model = input.model || process.env.SCENARIO_MODEL || DEFAULT_MODEL;
  const usage: OpenRouterUsageRecord[] = [];
  let previousResponse = "";
  let failureReason = "";
  let lastError: unknown = null;
  let incompatibleReviewUsed = false;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const data = await requestContentAdapterResponse({
        apiKey,
        model,
        userPrompt: attempt === 1 && !previousResponse && !failureReason
          ? buildScriptContentAdapterPrompt(input)
          : buildScriptContentAdapterRepairPrompt(input, previousResponse, failureReason),
      });
      let content: string;
      try {
        content = readAssistantContent(data);
      } catch (error) {
        failureReason = "модель вернула пустой ответ";
        lastError = error;
        continue;
      }
      previousResponse = content;
      const responseModel = String(data.model || model);
      const pricing = await getOpenRouterPricingSnapshot(responseModel);
      usage.push(normalizeOpenRouterUsage({
        layer: "content_adapter",
        model,
        response: data,
        attempt,
        pricing,
      }));
      let parsed: unknown;
      try {
        parsed = parseAndRepairJson(content);
      } catch {
        failureReason = "модель вернула невалидный JSON";
        lastError = new Error("Script content adapter returned invalid JSON");
        continue;
      }
      const contract = normalizeScriptContentContract(parsed);
      if (contract) {
        if (contract.adaptation.mode === "incompatible" && !incompatibleReviewUsed) {
          incompatibleReviewUsed = true;
          failureReason = "модель выбрала incompatible; перепроверь, можно ли перенести форму reference через format_transfer";
          lastError = new Error("Script content adapter requires incompatible-reference review");
          continue;
        }
        const resolvedContract = contract.adaptation.mode === "incompatible"
          ? fallbackIncompatibleContract(contract)
          : contract;
        return {
          contract: resolvedContract,
          model: responseModel,
          promptVersion: SCRIPT_CONTENT_ADAPTER_PROMPT_VERSION,
          openRouterUsage: usage,
          attemptCount: attempt,
        };
      }
      failureReason = `контракт не прошел схему, поля верхнего уровня: ${describeKeys(parsed)}`;
      lastError = new Error("Script content adapter returned invalid content contract JSON");
    } catch (error) {
      lastError = error;
      if (attempt === MAX_ATTEMPTS) break;
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError || "unknown error");
  throw new Error(`Script content adapter failed after ${MAX_ATTEMPTS} attempts: ${message}. Последняя причина: ${failureReason || "запрос не завершился"}`);
}

async function requestContentAdapterResponse(input: {
  apiKey: string;
  model: string;
  userPrompt: string;
}) {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://n8n-omnireels.ap2dy7.easypanel.host",
      "X-Title": "Omni Reels Script Content Adapter",
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0,
      max_tokens: 4000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SCRIPT_CONTENT_ADAPTER_SYSTEM_PROMPT },
        { role: "user", content: input.userPrompt },
      ],
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Script content adapter failed: ${response.status} ${text.slice(0, 240)}`);
  }
  return (await response.json()) as Record<string, unknown>;
}

function readAssistantContent(data: Record<string, unknown>) {
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const firstChoice = choices[0];
  const message = firstChoice && typeof firstChoice === "object" && !Array.isArray(firstChoice)
    ? (firstChoice as Record<string, unknown>).message
    : null;
  if (message && typeof message === "object" && !Array.isArray(message)) {
    const content = (message as Record<string, unknown>).content;
    if (typeof content === "string" && content.trim()) return content;
  }
  throw new Error("Script content adapter returned empty content");
}

function describeKeys(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return typeof value;
  return Object.keys(value).slice(0, 12).join(",") || "none";
}

function fallbackIncompatibleContract(contract: ScriptContentContract): ScriptContentContract {
  const adaptation = contract.adaptation;
  return {
    ...contract,
    adaptation: {
      ...adaptation,
      mode: "format_transfer",
      reason: `${adaptation.reason} Предмет reference заменен на новый продуктовый сюжет, сохранена форма подачи.`,
      preserve: adaptation.preserve.length ? adaptation.preserve : ["форма хука и личная подача reference"],
      replace: adaptation.replace.length ? adaptation.replace : ["исходный предметный тезис и механизм"],
      productBridge: adaptation.productBridge || "Построй новый сюжет вокруг подтвержденной пользы продукта.",
    },
  };
}
