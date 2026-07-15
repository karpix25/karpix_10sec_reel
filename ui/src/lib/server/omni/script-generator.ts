import type { CtaMode } from "@/lib/omni/creative-contract";
import type { OmniLegacyScenario } from "@/lib/omni/types";
import { formatScenarioScript } from "@/lib/scenario-text";
import type { DirectorBrief } from "./director-analysis-types";
import { assertOmniScriptTextContract, sanitizeOmniScriptText } from "./omni-script-text-contract";
import { ensureOmniScriptCta } from "./omni-cta-contract";
import { parseAndRepairJson } from "./script-json-repair";
import {
  assertGeneratedScriptSymbolContract,
  validateViralScriptContract,
  type ScriptQualityResult,
} from "./script-quality-contract";
import { buildPrompt } from "./script-prompt-helper";
import {
  buildScriptRetryFeedback,
  isRetryableScriptGenerationError,
  MAX_SCRIPT_GENERATION_ATTEMPTS,
} from "./script-generation-retry";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export type GeneratedScriptResultPayload = {
  title: string;
  hook: string;
  script: string;
  caption: string;
  cta_keyword: string;
  lead_magnet: string;
};

export async function generateScript(input: {
  model: string;
  projectName: string;
  targetAudience: string | null;
  brandVoice: string | null;
  productName: string;
  productDescription: string | null;
  productReferenceNotes: string | null;
  ctaMode: CtaMode;
  ctaValue: string | null;
  sourceScenario: OmniLegacyScenario;
  directorBrief?: DirectorBrief | null;
}): Promise<{
  payload: GeneratedScriptResultPayload;
  qualityCheck: ScriptQualityResult;
}> {
  let retryFeedback: string | null = null;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_SCRIPT_GENERATION_ATTEMPTS; attempt++) {
    try {
      return await requestScriptOnce(input, retryFeedback);
    } catch (error) {
      lastError = error;
      if (attempt >= MAX_SCRIPT_GENERATION_ATTEMPTS || !isRetryableScriptGenerationError(error)) {
        throw error;
      }
      retryFeedback = buildScriptRetryFeedback(error);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Script generation failed");
}

async function requestScriptOnce(
  input: Parameters<typeof generateScript>[0],
  retryFeedback: string | null
) {
  const apiKey = process.env.OPENROUTER_API_KEY || "";
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://n8n-omnireels.ap2dy7.easypanel.host",
      "X-Title": "Omni Reels",
    },
    body: JSON.stringify({
      model: input.model,
      temperature: retryFeedback ? 0.55 : 0.8,
      messages: [
        {
          role: "system",
          content:
            "Ты сценарист Instagram Reels. Пиши на русском, живо и просто. Верни только валидный JSON без markdown.",
        },
        {
          role: "user",
          content: buildPrompt({ ...input, retryFeedback }),
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Script model request failed: ${response.status} ${text.slice(0, 240)}`);
  }

  const data = await response.json();
  const content = String(data?.choices?.[0]?.message?.content || "");
  assertGeneratedScriptSymbolContract(content);
  const parsed = parseAndRepairJson(content);
  const rawScriptFromModel = String(parsed.script || "");
  const rawScript = sanitizeOmniScriptText(formatScenarioScript(parsed.script));
  if (!rawScript) throw new Error("Script model returned empty script");
  const script = ensureOmniScriptCta(rawScript, input.ctaMode, input.ctaValue);
  assertOmniScriptTextContract(script);

  const clean = (value: unknown) => sanitizeOmniScriptText(String(value || ""));

  const payload: GeneratedScriptResultPayload = {
    title: clean(parsed.title || parsed.hook || "Новый сценарий"),
    hook: clean(parsed.hook),
    script,
    caption: clean(parsed.caption),
    cta_keyword: clean(parsed.cta_keyword),
    lead_magnet: clean(parsed.lead_magnet),
  };

  const qualityCheck = validateViralScriptContract({
    script: payload.script,
    rawScriptBeforeCta: rawScript,
    rawScriptFromModel,
    hook: payload.hook || null,
    productName: input.productName,
    ctaMode: input.ctaMode,
    ctaValue: input.ctaValue,
  });

  return {
    payload,
    qualityCheck,
  };
}
