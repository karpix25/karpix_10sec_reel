import type { CtaMode, OmniScriptBeatCue } from "@/lib/omni/creative-contract";
import { detectAudioMoodFromText, normalizeAudioMood, type AudioMood } from "@/lib/audio-library/moods";
import { normalizeOpenRouterUsage, type OpenRouterUsageRecord } from "@/lib/omni/openrouter-cost";
import type { OmniWardrobeSource } from "../../omni/wardrobe-source";
import type { OmniLegacyScenario } from "@/lib/omni/types";
import { formatScenarioScript } from "@/lib/scenario-text";
import type { DirectorBrief } from "./director-analysis-types";
import { getOpenRouterPricingSnapshot } from "./openrouter-pricing";
import { assertOmniScriptTextContract, sanitizeOmniScriptText } from "./omni-script-text-contract";
import { ensureOmniScriptCta } from "./omni-cta-contract";
import { parseAndRepairJson } from "./script-json-repair";
import {
  assertGeneratedScriptSymbolContract,
  validateViralScriptContract,
  type ScriptQualityResult,
} from "./script-quality-contract";
import { buildPrompt } from "./script-prompt-helper";
import type { OmniDurationRange } from "./omni-duration-range";
import {
  appendCtaToLastBeat,
  deriveVoiceoverScriptFromPlan,
  normalizeGeneratedScriptBeatPlan,
} from "./script-beat-plan";
import { repairScriptBeatBoundaryRepeats } from "./omni-speech-boundary";
import {
  buildScriptGenerationFailure,
  buildScriptRetryFeedback,
  isRetryableScriptGenerationError,
  MAX_SCRIPT_GENERATION_ATTEMPTS,
} from "./script-generation-retry";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export type GeneratedScriptResultPayload = {
  title: string;
  hook_options: string[];
  selected_hook: string;
  hook: string;
  beats: OmniScriptBeatCue[];
  script: string;
  caption: string;
  cta_keyword: string;
  lead_magnet: string;
  background_audio_mood: AudioMood;
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
  wardrobeSource?: OmniWardrobeSource;
  durationRange?: OmniDurationRange;
}): Promise<{
  payload: GeneratedScriptResultPayload;
  qualityCheck: ScriptQualityResult;
  openRouterUsage: OpenRouterUsageRecord[];
}> {
  let retryFeedback: string | null = null;
  let lastError: unknown = null;
  const openRouterUsage: OpenRouterUsageRecord[] = [];

  for (let attempt = 1; attempt <= MAX_SCRIPT_GENERATION_ATTEMPTS; attempt++) {
    try {
      const result = await requestScriptOnce(input, retryFeedback, attempt, (usage) => {
        openRouterUsage.push(usage);
      });
      return { ...result, openRouterUsage };
    } catch (error) {
      lastError = error;
      if (attempt >= MAX_SCRIPT_GENERATION_ATTEMPTS || !isRetryableScriptGenerationError(error)) {
        throw buildScriptGenerationFailure(error, attempt);
      }
      retryFeedback = buildScriptRetryFeedback(error);
      console.warn("Omni script generation retry:", {
        attempt,
        maxAttempts: MAX_SCRIPT_GENERATION_ATTEMPTS,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw buildScriptGenerationFailure(lastError || new Error("Script generation failed"), MAX_SCRIPT_GENERATION_ATTEMPTS);
}

async function requestScriptOnce(
  input: Parameters<typeof generateScript>[0],
  retryFeedback: string | null,
  attempt: number,
  onUsage: (usage: OpenRouterUsageRecord) => void
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
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            [
              "Ты сценарист Instagram Reels. Пиши на русском, живо и просто.",
              "Верни только валидный JSON без markdown.",
              "Во всех текстовых значениях JSON запрещены emoji, дефисы, тире, минусы и цифры.",
              "Если нужно число, пиши его словами. Если нужен разделитель, используй запятую или точку.",
              "Перед финальным ответом проверь каждый символ в строковых значениях JSON.",
            ].join(" "),
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

  const data = (await response.json()) as Record<string, unknown>;
  const pricing = await getOpenRouterPricingSnapshot(String(data.model || input.model));
  onUsage(normalizeOpenRouterUsage({ layer: "script_writer", model: input.model, response: data, attempt, pricing }));
  const content = readAssistantContent(data);
  assertGeneratedScriptSymbolContract(content);
  const parsed = parseAndRepairJson(content);
  const scriptPlan = normalizeGeneratedScriptBeatPlan(parsed);
  const voiceoverScript = deriveVoiceoverScriptFromPlan(scriptPlan);
  const rawScriptSource = voiceoverScript || parsed.script;
  const rawScriptFromModel = String(rawScriptSource || "");
  const rawScript = sanitizeOmniScriptText(formatScenarioScript(rawScriptSource));
  if (!rawScript) throw new Error("Script model returned empty script");
  let script = ensureOmniScriptCta(rawScript, input.ctaMode, input.ctaValue);
  let persistedScriptPlan = appendCtaToLastBeat(scriptPlan, rawScript, script);
  const boundaryRepair = repairScriptBeatBoundaryRepeats(persistedScriptPlan);
  if (boundaryRepair.repair.changed && boundaryRepair.plan && boundaryRepair.scriptText) {
    persistedScriptPlan = boundaryRepair.plan;
    script = sanitizeOmniScriptText(boundaryRepair.scriptText);
  }
  assertOmniScriptTextContract(script);

  const clean = (value: unknown) => sanitizeOmniScriptText(String(value || ""));

  const payload: GeneratedScriptResultPayload = {
    title: clean(parsed.title || persistedScriptPlan?.selectedHook || parsed.hook || "Новый сценарий"),
    hook_options: persistedScriptPlan?.hookOptions || [],
    selected_hook: persistedScriptPlan?.selectedHook || clean(parsed.hook),
    hook: persistedScriptPlan?.selectedHook || clean(parsed.hook),
    beats: persistedScriptPlan?.beats || [],
    script,
    caption: clean(parsed.caption),
    cta_keyword: clean(parsed.cta_keyword),
    lead_magnet: clean(parsed.lead_magnet),
    background_audio_mood: normalizeAudioMood(parsed.background_audio_mood, detectAudioMoodFromText(script)),
  };

  const qualityCheck = validateViralScriptContract({
    script: payload.script,
    rawScriptBeforeCta: rawScript,
    rawScriptFromModel,
    hook: payload.hook || null,
    productName: input.productName,
    ctaMode: input.ctaMode,
    ctaValue: input.ctaValue,
    durationRange: input.durationRange,
  });

  return {
    payload,
    qualityCheck,
  };
}

function readAssistantContent(data: Record<string, unknown>) {
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const firstChoice = choices[0];
  const message =
    firstChoice && typeof firstChoice === "object" && !Array.isArray(firstChoice)
      ? (firstChoice as Record<string, unknown>).message
      : null;
  if (message && typeof message === "object" && !Array.isArray(message)) {
    const content = (message as Record<string, unknown>).content;
    if (typeof content === "string") return content;
  }
  return "";
}
