import { detectAudioMoodFromText, normalizeAudioMood } from "@/lib/audio-library/moods";
import {
  normalizeOpenRouterUsage,
  type OpenRouterUsageLayer,
  type OpenRouterUsageRecord,
} from "@/lib/omni/openrouter-cost";
import { formatScenarioScript } from "@/lib/scenario-text";
import { assertOmniScriptTextContract, sanitizeOmniScriptText } from "./omni-script-text-contract";
import { getOpenRouterPricingSnapshot } from "./openrouter-pricing";
import { parseAndRepairJson } from "./script-json-repair";
import { validateViralScriptContract } from "./script-quality-contract";
import {
  LLM_PROMPT_CHAIN_VERSION,
  type CreativeScriptDraft,
  type DirectorSegmentPlan,
  type LlmPromptChainResult,
  type PromptValidationIssue,
  type ScriptSemanticReview,
} from "./llm-prompt-chain-types";
import {
  buildDirectorSegmentRepairPrompt,
  buildDirectorSegmenterPrompt,
  type PromptChainInput,
} from "./llm-prompt-chain-prompts";
import {
  buildCreativeCopywriterAttemptPrompt,
} from "./llm-prompt-chain-creative-repair";
import {
  buildProviderPromptPlanFromDirector,
  lockDirectorPlanSpeech,
  normalizeCreativeScriptDraft,
  normalizeDirectorSegmentPlan,
} from "./llm-prompt-chain-normalizer";
import {
  formatPromptValidationIssues,
  validateDirectorSegmentPlan,
  validateProviderPromptPlan,
} from "./provider-prompt-contract-validator";
import {
  validateStoryboardDirectorPlan,
  validateStoryboardProviderAlignment,
  validateStoryboardProviderPlan,
} from "./llm-prompt-chain-storyboard-validator";
import {
  assertScriptSemanticReviewPassed,
  reviewScriptSemantics,
} from "./script-semantic-reviewer";
import { assertRussianSpeechGender, normalizeRussianSpeechGender } from "./russian-speech-gender-contract";
import {
  formatPromptChainNumber,
  spellPromptChainNumbersInText,
} from "./llm-prompt-chain-number-words";
import { countOmniScriptWords, getOmniMaxScriptWords, planOmniReelSegments } from "./omni-duration-planner";
import { resolveDirectorSegmentFormat } from "./director-analysis-timeline";
import { compactOmniScriptToWordBudget } from "./omni-script-length-guard";
import {
  diagnoseDirectorSegmenterOutput,
  formatDirectorSegmenterDiagnostic,
  type DirectorSegmenterAttemptDiagnostic,
} from "./llm-prompt-chain-diagnostics";
import { getScriptContentMeaningSignals } from "./script-content-contract";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const CREATIVE_COPYWRITER_ATTEMPTS = 2;
const DIRECTOR_TARGETED_REPAIR_ATTEMPTS = 2;
const PROMPT_CHAIN_TEMPERATURE = 0.8;
const PROMPT_CHAIN_REQUEST_TIMEOUT_MS = 90_000;

export type LlmPromptChainFailureStage =
  | "creative_copywriter"
  | "director_segmenter"
  | "provider_plan_validation";

export type LlmPromptChainPartialSnapshot = {
  adaptationPlan?: PromptChainInput["adaptationPlan"];
  contentContract?: PromptChainInput["contentContract"];
  creativeScriptDraft?: CreativeScriptDraft;
  semanticReview?: ScriptSemanticReview;
  directorSegmentPlan?: DirectorSegmentPlan;
  directorSegmenterDiagnostics?: DirectorSegmenterAttemptDiagnostic[];
};

class DirectorSegmenterFailure extends Error {
  constructor(message: string, readonly diagnostics: DirectorSegmenterAttemptDiagnostic[]) {
    super(message);
    this.name = "DirectorSegmenterFailure";
  }
}

export class LlmPromptChainFailure extends Error {
  constructor(
    readonly stage: LlmPromptChainFailureStage,
    message: string,
    readonly partialSnapshot: LlmPromptChainPartialSnapshot
  ) {
    super(message);
    this.name = "LlmPromptChainFailure";
  }
}

export function isLlmPromptChainEnabled() {
  return process.env.OMNI_LLM_PROMPT_CHAIN !== "false";
}
export async function runLlmPromptChain(input: PromptChainInput & { model: string }): Promise<{
  result: LlmPromptChainResult;
  openRouterUsage: OpenRouterUsageRecord[];
}> {
  const adaptationPlan = input.adaptationPlan;
  const contentContract = input.contentContract;
  const chainInput = input;
  const openRouterUsage: OpenRouterUsageRecord[] = [];
  const onUsage = (usage: OpenRouterUsageRecord) => openRouterUsage.push(usage);
  let creativeResult: Awaited<ReturnType<typeof runCreativeCopywriter>>;
  try {
    creativeResult = await runCreativeCopywriter(chainInput, onUsage);
  } catch (error) {
    if (error instanceof LlmPromptChainFailure) throw error;
    throw new LlmPromptChainFailure("creative_copywriter", getErrorMessage(error), { adaptationPlan, contentContract });
  }
  const draft = creativeResult.draft;
  let directorResult: Awaited<ReturnType<typeof runDirectorSegmenter>>;
  try {
      directorResult = await runDirectorSegmenter(chainInput, draft, onUsage);
  } catch (error) {
    const directorFailure = error instanceof DirectorSegmenterFailure ? error : null;
    throw new LlmPromptChainFailure("director_segmenter", getErrorMessage(error), {
      adaptationPlan,
      contentContract,
      creativeScriptDraft: draft,
      semanticReview: creativeResult.semanticReview,
      ...(directorFailure ? { directorSegmenterDiagnostics: directorFailure.diagnostics } : {}),
    });
  }
  const directorPlan = directorResult.plan;
  const providerPlan = buildProviderPromptPlanFromDirector(directorPlan);
  let providerValidationIssues: PromptValidationIssue[] = [];
  try {
    providerValidationIssues = [
      ...validateProviderPromptPlan(providerPlan),
      ...validateStoryboardProviderPlan(providerPlan),
      ...validateStoryboardProviderAlignment(directorPlan, providerPlan),
    ];
    const errors = providerValidationIssues.filter((issue) => issue.severity === "error");
    if (errors.length) throw new Error(formatPromptValidationIssues(errors));
  } catch (error) {
    throw new LlmPromptChainFailure("provider_plan_validation", getErrorMessage(error), {
      adaptationPlan,
      contentContract,
      creativeScriptDraft: draft,
      semanticReview: creativeResult.semanticReview,
      directorSegmentPlan: directorPlan,
    });
  }
  const script = normalizeRussianSpeechGender(
    sanitizeOmniScriptText(spellPromptChainNumbersInText(formatScenarioScript(directorPlan.totalVoiceover))),
    input.avatarSpeechGender
  );
  assertPromptChainNumericRangeIntegrity(input.sourceScenario.script, script);
  assertOmniScriptTextContract(script);
  assertRussianSpeechGender(script, input.avatarSpeechGender);
  return {
    result: {
      title: directorPlan.title,
      hookOptions: directorPlan.hookOptions,
      selectedHook: directorPlan.selectedHook,
      script,
      caption: "",
      ctaKeyword: input.ctaMode === "keyword_in_comments" ? input.ctaValue || "" : "",
      leadMagnet: "",
      backgroundAudioMood: normalizeAudioMood(null, detectAudioMoodFromText(script)),
      beats: directorPlan.segments.map((segment, index) => ({
        stage: index === 0 ? "hook" : index === directorPlan.segments.length - 1 ? "cta" : "body",
        visualCue: segment.storyboardFrames.length
          ? segment.storyboardFrames.map((frame) => `${frame.role}: ${frame.visualDescription}`).join(". ")
          : segment.shots.map((shot) => `${shot.role}: ${shot.action}`).join(". "),
        voiceover: segment.voiceover,
      })),
      snapshot: {
        version: LLM_PROMPT_CHAIN_VERSION,
        adaptationPlan,
        contentContract,
        creativeScriptDraft: draft,
        directorSegmentPlan: directorPlan,
        providerPromptPlan: providerPlan,
        semanticReview: creativeResult.semanticReview,
        validationIssues: [...directorResult.validationIssues, ...providerValidationIssues],
      },
    },
    openRouterUsage,
  };
}
export function assertPromptChainNumericRangeIntegrity(referenceScript: string, script: string) {
  const normalizedScript = script.toLocaleLowerCase("ru-RU");
  for (const range of findNumericRanges(referenceScript)) {
    const collapsed = formatPromptChainNumber(Number(`${range.min}${range.max}`));
    if (normalizedScript.includes(collapsed)) {
      throw new Error(
        `Сценарий схлопнул числовой диапазон ${range.min}-${range.max} в ${range.min}${range.max}; черновик нельзя сохранять.`
      );
    }
  }
}

function findNumericRanges(value: string) {
  const ranges: Array<{ min: string; max: string }> = [];
  const rangePattern = /(?<!\d)(?:от\s+)?(\d{1,3}(?:[\u00A0\u202F ]\d{3})*)\s*(?:[-‐‑‒–—―−]|до)\s*(\d{1,3}(?:[\u00A0\u202F ]\d{3})*)(?!\d)/giu;
  for (const match of value.matchAll(rangePattern)) {
    const min = match[1].replace(/[\s\u00A0\u202F]/gu, "");
    const max = match[2].replace(/[\s\u00A0\u202F]/gu, "");
    if (Number.isSafeInteger(Number(min)) && Number.isSafeInteger(Number(max))) ranges.push({ min, max });
  }
  return ranges;
}

async function runCreativeCopywriter(
  input: PromptChainInput & { model: string },
  onUsage: (usage: OpenRouterUsageRecord) => void
) {
  let previousDraft: CreativeScriptDraft | null = null;
  let lastSemanticReview: ScriptSemanticReview | null = null;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= CREATIVE_COPYWRITER_ATTEMPTS; attempt += 1) {
    try {
      const creativeAttempt = buildCreativeCopywriterAttemptPrompt({
        chainInput: input,
        attempt,
        maxAttempts: CREATIVE_COPYWRITER_ATTEMPTS,
        previousDraft,
        semanticReview: lastSemanticReview,
        failureReason: getErrorMessage(lastError),
      });
      const content = await requestOpenRouter({
        input,
        layer: "creative_copywriter",
        attempt,
        userPrompt: creativeAttempt.prompt,
        responseFormatJson: false,
        temperature: creativeAttempt.mode === "full_rebuild"
          ? 0.65
          : creativeAttempt.mode === "targeted_repair" ? 0.25 : PROMPT_CHAIN_TEMPERATURE,
        onUsage,
      });
      const draft = normalizeCreativeScriptDraft(content);
      if (!draft) throw new Error("Creative copywriter returned empty script");
      const normalizedScript = normalizeRussianSpeechGender(
        sanitizeOmniScriptText(spellPromptChainNumbersInText(formatScenarioScript(draft.script))),
        input.avatarSpeechGender
      );
      const maxWords = input.durationRange?.maxWords || getOmniMaxScriptWords();
      const script = compactOmniScriptToWordBudget(normalizedScript, maxWords, {
        referenceScript: input.sourceScenario.script,
        productName: input.productName,
        adaptationMode: input.adaptationPlan.mode,
        requiredMeaning: input.contentContract ? getScriptContentMeaningSignals(input.contentContract) : undefined,
      });
      if (countOmniScriptWords(script) > maxWords) {
        throw new Error(`Сценарий длиннее лимита после автоматического сокращения: ${countOmniScriptWords(script)} слов вместо ${maxWords}.`);
      }
      assertPromptChainNumericRangeIntegrity(input.sourceScenario.script, script);
      previousDraft = { ...draft, script };
      lastSemanticReview = null;
      assertOmniScriptTextContract(script);
      assertPromptChainScriptQuality(input, script, null);
      assertRussianSpeechGender(script, input.avatarSpeechGender);
      planOmniReelSegments(script, { durationRange: input.durationRange });
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
      lastSemanticReview = semanticReview;
      assertScriptSemanticReviewPassed(semanticReview);
      return {
        draft: { ...draft, script },
        semanticReview,
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw new LlmPromptChainFailure(
    "creative_copywriter",
    `Creative copywriter failed: ${getErrorMessage(lastError)}`,
    {
      adaptationPlan: input.adaptationPlan,
      contentContract: input.contentContract,
      ...(previousDraft ? { creativeScriptDraft: previousDraft } : {}),
      ...(lastSemanticReview ? { semanticReview: lastSemanticReview } : {}),
    }
  );
}

async function runDirectorSegmenter(
  input: PromptChainInput & { model: string },
  draft: CreativeScriptDraft,
  onUsage: (usage: OpenRouterUsageRecord) => void
) {
  const segmentPlan = planOmniReelSegments(draft.script, { durationRange: input.durationRange });
  const format = resolveDirectorSegmentFormat(input.directorBrief);
  const basePrompt = buildDirectorSegmenterPrompt({ chainInput: input, draft, segmentPlan });
  const maxAttempts = DIRECTOR_TARGETED_REPAIR_ATTEMPTS + 2;
  let previousPlan: DirectorSegmentPlan | null = null;
  let lastError: unknown = null;
  const diagnostics: DirectorSegmenterAttemptDiagnostic[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let attemptDiagnostic: DirectorSegmenterAttemptDiagnostic | null = null;
    try {
      const isFullRebuild = attempt === maxAttempts;
      const userPrompt = previousPlan && !isFullRebuild
        ? buildDirectorSegmentRepairPrompt({
          basePrompt,
          previousPlan,
          validationError: getErrorMessage(lastError),
          repairAttempt: attempt - 1,
        })
        : appendRetry(basePrompt, lastError
          ? `${isFullRebuild ? "Полностью пересобери визуальную режиссуру" : "Исправь план"}. Не меняй утвержденные voiceover и duration_seconds. Последняя ошибка: ${getErrorMessage(lastError)}`
          : "");
      const content = await requestOpenRouter({
        input,
        layer: "director_segmenter",
        attempt,
        userPrompt,
        responseFormatJson: true,
        temperature: isFullRebuild ? 0.65 : attempt === 1 ? PROMPT_CHAIN_TEMPERATURE : 0.35,
        onUsage,
      });
      let parsed: unknown;
      try {
        parsed = parseAndRepairJson(content);
      } catch (error) {
        attemptDiagnostic = diagnoseDirectorSegmenterOutput({
          attempt,
          model: input.model,
          content,
          status: "parse_failed",
          error: getErrorMessage(error),
        });
        throw error;
      }
      attemptDiagnostic = diagnoseDirectorSegmenterOutput({
        attempt,
        model: input.model,
        content,
        parsed,
        status: "success",
      });
      const normalizedPlan = normalizeDirectorSegmentPlan(parsed);
      if (!normalizedPlan) {
        const reason = formatDirectorSegmenterDiagnostic({ ...attemptDiagnostic, status: "schema_invalid" });
        attemptDiagnostic = { ...attemptDiagnostic, status: "schema_invalid", error: reason };
        throw new Error(`Director segmenter returned invalid JSON plan: ${reason}`);
      }
      previousPlan = normalizedPlan;
      const plan = lockDirectorPlanSpeech(
        normalizedPlan,
        segmentPlan.segments,
        segmentPlan.segmentDurationsSeconds,
        format
      );
      const finalScript = normalizeRussianSpeechGender(
        sanitizeOmniScriptText(formatScenarioScript(plan.totalVoiceover)),
        input.avatarSpeechGender
      );
      assertRussianSpeechGender(finalScript, input.avatarSpeechGender);
      const validationIssues = [
        ...validateDirectorSegmentPlan(plan),
        ...validateStoryboardDirectorPlan(plan),
      ];
      const errors = validationIssues.filter((issue) => issue.severity === "error");
      if (errors.length) {
        const reason = formatPromptValidationIssues(errors);
        attemptDiagnostic = { ...attemptDiagnostic, status: "contract_invalid", error: reason };
        throw new Error(reason);
      }
      assertPromptChainScriptQuality(input, finalScript, plan.selectedHook);
      attemptDiagnostic = { ...attemptDiagnostic, status: "success", error: null };
      return { plan, validationIssues };
    } catch (error) {
      if (!attemptDiagnostic) {
        attemptDiagnostic = diagnoseDirectorSegmenterOutput({
          attempt,
          model: input.model,
          content: "",
          status: "request_failed",
          error: getErrorMessage(error),
        });
      } else if (!attemptDiagnostic.error) {
        attemptDiagnostic = { ...attemptDiagnostic, status: "contract_invalid", error: getErrorMessage(error) };
      }
      diagnostics.push(attemptDiagnostic);
      console.warn("Omni director segmenter attempt failed:", attemptDiagnostic);
      lastError = error;
      if (attempt === DIRECTOR_TARGETED_REPAIR_ATTEMPTS + 1) previousPlan = null;
    }
  }
  throw new DirectorSegmenterFailure(`Director segmenter failed: ${getErrorMessage(lastError)}`, diagnostics);
}

async function requestOpenRouter(input: {
  input: PromptChainInput & { model: string };
  layer: OpenRouterUsageLayer;
  attempt: number;
  userPrompt: string;
  responseFormatJson: boolean;
  temperature?: number;
  onUsage: (usage: OpenRouterUsageRecord) => void;
}) {
  const apiKey = process.env.OPENROUTER_API_KEY || "";
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");
  const body: Record<string, unknown> = {
    model: input.input.model,
    temperature: input.temperature ?? PROMPT_CHAIN_TEMPERATURE,
    max_tokens: input.responseFormatJson ? 12_000 : 4_000,
    messages: [
      {
        role: "system",
        content: input.responseFormatJson
          ? "Верни только валидный JSON без markdown."
          : "Верни только запрошенный текст без markdown и пояснений.",
      },
      { role: "user", content: input.userPrompt },
    ],
  };
  if (input.responseFormatJson) body.response_format = { type: "json_object" };

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://n8n-omnireels.ap2dy7.easypanel.host",
      "X-Title": "Omni Reels",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(PROMPT_CHAIN_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Prompt chain request failed: ${response.status} ${text.slice(0, 240)}`);
  }
  const data = (await response.json()) as Record<string, unknown>;
  const pricing = await getOpenRouterPricingSnapshot(String(data.model || input.input.model));
  input.onUsage(normalizeOpenRouterUsage({
    layer: input.layer,
    model: input.input.model,
    response: data,
    attempt: input.attempt,
    pricing,
  }));
  return readAssistantContent(data);
}

function assertPromptChainScriptQuality(
  input: PromptChainInput & { model: string },
  script: string,
  hook: string | null
) {
  validateViralScriptContract({
    script,
    rawScriptBeforeCta: script,
    rawScriptFromModel: script,
    hook,
    productName: input.productName,
    ctaMode: input.ctaMode,
    ctaValue: input.ctaValue,
    durationRange: input.durationRange,
    referenceScript: input.sourceScenario.script,
    adaptationMode: input.adaptationPlan.mode,
  });
}

function appendRetry(prompt: string, retryFeedback: string) {
  return retryFeedback ? `${prompt}\n\nПовторная попытка:\n${retryFeedback}` : prompt;
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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "unknown error");
}
