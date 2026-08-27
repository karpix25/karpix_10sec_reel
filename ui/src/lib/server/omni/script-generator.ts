import type { CtaMode, OmniScriptBeatCue } from "@/lib/omni/creative-contract";
import { detectAudioMoodFromText, normalizeAudioMood, type AudioMood } from "@/lib/audio-library/moods";
import { normalizeOpenRouterUsage, type OpenRouterUsageRecord } from "@/lib/omni/openrouter-cost";
import type { OmniAvatarSpeechGender } from "../../omni/avatar-speech-gender";
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
  isReferenceMeaningScriptGenerationError,
  isRetryableScriptGenerationError,
  MAX_REFERENCE_MEANING_REPAIR_ATTEMPTS,
  MAX_SCRIPT_GENERATION_ATTEMPTS,
} from "./script-generation-retry";
import {
  assertPromptChainNumericRangeIntegrity,
  isLlmPromptChainEnabled,
  runLlmPromptChain,
} from "./llm-prompt-chain-runner";
import {
  assertScriptSemanticReviewPassed,
  reviewScriptSemantics,
} from "./script-semantic-reviewer";
import type { ScriptSemanticReview } from "./llm-prompt-chain-types";
import { assertRussianSpeechGender, normalizeRussianSpeechGender } from "./russian-speech-gender-contract";
import { spellPromptChainNumbersInText } from "./llm-prompt-chain-number-words";
import { getOmniMaxScriptWords, planOmniReelSegments } from "./omni-duration-planner";
import { compactOmniScriptToWordBudget } from "./omni-script-length-guard";
import type { ScriptAdaptationPlan } from "./script-adaptation-contract";
import {
  buildLegacyScriptContentContract,
  IncompatibleReferenceError,
  getScriptContentMeaningSignals,
  type ScriptContentContract,
} from "./script-content-contract";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const SCRIPT_GENERATION_REQUEST_TIMEOUT_MS = 90_000;

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
  semantic_review: ScriptSemanticReview | null;
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
  avatarSpeechGender: OmniAvatarSpeechGender;
  adaptationPlan: ScriptAdaptationPlan;
  contentContract?: ScriptContentContract;
}): Promise<{
  payload: GeneratedScriptResultPayload;
  qualityCheck: ScriptQualityResult;
  semanticReview: ScriptSemanticReview | null;
  openRouterUsage: OpenRouterUsageRecord[];
  llmPromptChainSnapshot?: Record<string, unknown>;
}> {
  if (input.adaptationPlan.mode === "incompatible") {
    throw new IncompatibleReferenceError(
      input.contentContract || buildLegacyScriptContentContract(input.sourceScenario.script, input.adaptationPlan),
    );
  }
  if (isLlmPromptChainEnabled()) return requestPromptChainScript(input);

  let retryFeedback: string | null = null;
  let referenceMeaningRepair: string | null = null;
  let lastError: unknown = null;
  const openRouterUsage: OpenRouterUsageRecord[] = [];

  for (let attempt = 1; attempt <= MAX_SCRIPT_GENERATION_ATTEMPTS + MAX_REFERENCE_MEANING_REPAIR_ATTEMPTS; attempt++) {
    try {
      const result = await requestScriptOnce(input, retryFeedback, attempt, (usage) => {
        openRouterUsage.push(usage);
      });
      return { ...result, openRouterUsage };
    } catch (error) {
      lastError = error;
      const retryable = isRetryableScriptGenerationError(error);
      const referenceMeaningFailed = isReferenceMeaningScriptGenerationError(error);
      const feedback = buildScriptRetryFeedback(error, {
        referenceScript: input.sourceScenario.script,
      });
      if (referenceMeaningFailed) referenceMeaningRepair = feedback;
      const maxAttempts = MAX_SCRIPT_GENERATION_ATTEMPTS +
        (referenceMeaningRepair ? MAX_REFERENCE_MEANING_REPAIR_ATTEMPTS : 0);
      if (attempt >= maxAttempts || !retryable) {
        throw buildScriptGenerationFailure(error, attempt);
      }
      retryFeedback = referenceMeaningRepair && feedback !== referenceMeaningRepair
        ? `${feedback}\n\n${referenceMeaningRepair}`
        : feedback;
      console.warn("Omni script generation retry:", {
        attempt,
        maxAttempts,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw buildScriptGenerationFailure(
    lastError || new Error("Script generation failed"),
    MAX_SCRIPT_GENERATION_ATTEMPTS + (referenceMeaningRepair ? MAX_REFERENCE_MEANING_REPAIR_ATTEMPTS : 0)
  );
}

async function requestPromptChainScript(input: Parameters<typeof generateScript>[0]) {
  const generated = await runLlmPromptChain(input);
  const payload: GeneratedScriptResultPayload = {
    title: sanitizeOmniScriptText(generated.result.title || "Новый сценарий"),
    hook_options: generated.result.hookOptions,
    selected_hook: sanitizeOmniScriptText(generated.result.selectedHook),
    hook: sanitizeOmniScriptText(generated.result.selectedHook),
    beats: generated.result.beats.map((beat) => ({
      stage: beat.stage,
      visualCue: sanitizeOmniScriptText(beat.visualCue),
      voiceover: sanitizeOmniScriptText(beat.voiceover),
    })),
    script: generated.result.script,
    caption: sanitizeOmniScriptText(generated.result.caption),
    cta_keyword: sanitizeOmniScriptText(generated.result.ctaKeyword),
    lead_magnet: sanitizeOmniScriptText(generated.result.leadMagnet),
    background_audio_mood: generated.result.backgroundAudioMood,
    semantic_review: generated.result.snapshot.semanticReview,
  };
  const qualityCheck = validateViralScriptContract({
    script: payload.script,
    rawScriptBeforeCta: payload.script,
    rawScriptFromModel: payload.script,
    hook: payload.hook || null,
    productName: input.productName,
    ctaMode: input.ctaMode,
    ctaValue: input.ctaValue,
    durationRange: input.durationRange,
    referenceScript: input.sourceScenario.script,
    adaptationMode: input.adaptationPlan.mode,
  });
  return {
    payload,
    qualityCheck,
    semanticReview: payload.semantic_review,
    openRouterUsage: generated.openRouterUsage,
    llmPromptChainSnapshot: generated.result.snapshot,
  };
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
      max_tokens: 10000,
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
    signal: AbortSignal.timeout(SCRIPT_GENERATION_REQUEST_TIMEOUT_MS),
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
  const rawScript = spellPromptChainNumbersInText(sanitizeOmniScriptText(formatScenarioScript(rawScriptSource)));
  if (!rawScript) throw new Error("Script model returned empty script");
  let script = ensureOmniScriptCta(rawScript, input.ctaMode, input.ctaValue);
  const scriptBudget = getOmniMaxScriptWords();
  const compactedScript = compactOmniScriptToWordBudget(script, scriptBudget, {
    referenceScript: input.sourceScenario.script,
    productName: input.productName,
    adaptationMode: input.adaptationPlan.mode,
    requiredMeaning: input.contentContract ? getScriptContentMeaningSignals(input.contentContract) : undefined,
  });
  const wasCompacted = compactedScript !== script;
  script = compactedScript;
  let persistedScriptPlan = wasCompacted ? null : appendCtaToLastBeat(scriptPlan, rawScript, script);
  const boundaryRepair = repairScriptBeatBoundaryRepeats(persistedScriptPlan);
  if (boundaryRepair.repair.changed && boundaryRepair.plan && boundaryRepair.scriptText) {
    persistedScriptPlan = boundaryRepair.plan;
    script = sanitizeOmniScriptText(boundaryRepair.scriptText);
  }
  assertOmniScriptTextContract(script);
  script = normalizeRussianSpeechGender(script, input.avatarSpeechGender);
  assertPromptChainNumericRangeIntegrity(input.sourceScenario.script, script);
  if (persistedScriptPlan) {
    persistedScriptPlan = {
      ...persistedScriptPlan,
      hookOptions: persistedScriptPlan.hookOptions.map((hook) => normalizeRussianSpeechGender(hook, input.avatarSpeechGender)),
      selectedHook: normalizeRussianSpeechGender(persistedScriptPlan.selectedHook, input.avatarSpeechGender),
      beats: persistedScriptPlan.beats.map((beat) => ({
        ...beat,
        voiceover: normalizeRussianSpeechGender(beat.voiceover, input.avatarSpeechGender),
      })),
    };
  }
  assertRussianSpeechGender(script, input.avatarSpeechGender);

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
    semantic_review: null,
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
    referenceScript: input.sourceScenario.script,
    adaptationMode: input.adaptationPlan.mode,
  });
  try {
    planOmniReelSegments(script, { durationRange: input.durationRange });
  } catch (error) {
    throw new Error(`Сценарий отклонен: ${error instanceof Error ? error.message : String(error)}`);
  }
  const semanticReview = await reviewScriptSemantics({
    model: input.model,
    script,
    referenceScript: input.sourceScenario.script,
    productName: input.productName,
    productDescription: input.productDescription,
    productReferenceNotes: input.productReferenceNotes,
    ctaMode: input.ctaMode,
    ctaValue: input.ctaValue,
    directorBrief: input.directorBrief,
    adaptationPlan: input.adaptationPlan,
    contentContract: input.contentContract,
  }, onUsage, attempt);
  assertScriptSemanticReviewPassed(semanticReview);
  payload.semantic_review = semanticReview;
  return {
    payload,
    qualityCheck,
    semanticReview,
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
