import { normalizeOpenRouterUsage, type OpenRouterUsageRecord } from "@/lib/omni/openrouter-cost";
import { parseAndRepairJson } from "./script-json-repair";
import {
  normalizeScriptContentContract,
  type ScriptContentContract,
} from "./script-content-contract";
import {
  buildScriptContentAdapterPrompt,
  SCRIPT_CONTENT_ADAPTER_PROMPT_VERSION,
  SCRIPT_CONTENT_ADAPTER_SYSTEM_PROMPT,
} from "./script-content-adapter-prompt";
import { getOpenRouterPricingSnapshot } from "./openrouter-pricing";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-3.5-flash-lite";
const REQUEST_TIMEOUT_MS = 90_000;

export type ScriptContentAdapterResult = {
  contract: ScriptContentContract;
  model: string;
  promptVersion: typeof SCRIPT_CONTENT_ADAPTER_PROMPT_VERSION;
  openRouterUsage: OpenRouterUsageRecord;
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
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://n8n-omnireels.ap2dy7.easypanel.host",
      "X-Title": "Omni Reels Script Content Adapter",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SCRIPT_CONTENT_ADAPTER_SYSTEM_PROMPT },
        { role: "user", content: buildScriptContentAdapterPrompt(input) },
      ],
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Script content adapter failed: ${response.status} ${text.slice(0, 240)}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const contract = normalizeScriptContentContract(parseAndRepairJson(readAssistantContent(data)));
  if (!contract) throw new Error("Script content adapter returned invalid content contract JSON");
  const responseModel = String(data.model || model);
  const pricing = await getOpenRouterPricingSnapshot(responseModel);
  return {
    contract,
    model: responseModel,
    promptVersion: SCRIPT_CONTENT_ADAPTER_PROMPT_VERSION,
    openRouterUsage: normalizeOpenRouterUsage({
      layer: "content_adapter",
      model,
      response: data,
      attempt: 1,
      pricing,
    }),
  };
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
