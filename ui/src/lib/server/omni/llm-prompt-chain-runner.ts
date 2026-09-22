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
import {
  LLM_PROMPT_CHAIN_VERSION,
  type CreativeScriptDraft,
  type CreativeScriptAttemptDiagnostic,
  type DirectorSegmentPlan,
  type LlmPromptChainResult,
  type OmniBeatSheet,
  type PromptValidationIssue,
  type ScriptSemanticReview,
} from "./llm-prompt-chain-types";
import {
  buildUnifiedContentPlannerPrompt,
  buildDirectorSegmentRepairPrompt,
  buildDirectorSegmenterPrompt,
  type PromptChainInput,
} from "./llm-prompt-chain-prompts";
import { DIRECTOR_ANALYSIS_SYSTEM_PROMPT } from "./director-analysis-prompt";
import { normalizeDirectorBrief } from "./director-analysis-types";
import { runCreativeCopywriter, CreativeCopywriterFailure } from "./llm-creative-copywriter";
import { assertPromptChainNumericRangeIntegrity, validateCreativeScriptQuality } from "./creative-script-preflight";
import {
  buildProviderPromptPlanFromDirector,
  lockDirectorPlanSpeech,
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
import { assertRussianSpeechGender, normalizeRussianSpeechGender } from "./russian-speech-gender-contract";
import {
  spellPromptChainNumbersInText,
} from "./llm-prompt-chain-number-words";
import type { OmniReelSegmentPlan } from "./omni-duration-planner";
import { resolveDirectorSegmentFormat } from "./director-analysis-timeline";
import {
  diagnoseDirectorSegmenterOutput,
  formatDirectorSegmenterDiagnostic,
  type DirectorSegmenterAttemptDiagnostic,
} from "./llm-prompt-chain-diagnostics";
import { buildOmniBeatSheet, validateOmniBeatSheetAlignment } from "./omni-beat-sheet";

export { assertPromptChainNumericRangeIntegrity } from "./creative-script-preflight";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
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
  creativeAttemptDiagnostics?: CreativeScriptAttemptDiagnostic[];
  semanticReview?: ScriptSemanticReview;
  beatSheet?: OmniBeatSheet;
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

export async function runLlmPromptChain(input: PromptChainInput & { model: string }): Promise<{
  result: LlmPromptChainResult;
  openRouterUsage: OpenRouterUsageRecord[];
}> {
  return runUnifiedLlmPromptChain(input);
}

async function runUnifiedLlmPromptChain(input: PromptChainInput & { model: string }): Promise<{
  result: LlmPromptChainResult;
  openRouterUsage: OpenRouterUsageRecord[];
}> {
  if (!input.referenceVideoUrl?.trim()) {
    throw new LlmPromptChainFailure("creative_copywriter", "Reference video URL is required for unified content planning", {
      adaptationPlan: input.adaptationPlan,
      contentContract: input.contentContract,
    });
  }
  const openRouterUsage: OpenRouterUsageRecord[] = [];
  const content = await requestOpenRouter({
    input,
    layer: "content_adapter",
    attempt: 1,
    userPrompt: buildUnifiedContentPlannerPrompt(input),
    systemPrompt: `${DIRECTOR_ANALYSIS_SYSTEM_PROMPT}\nТы должен вернуть director_brief вместе со сценарием и раскадровкой в одном корневом JSON.`,
    videoUrl: input.referenceVideoUrl,
    responseFormatJson: true,
    maxTokens: 30_000,
    temperature: 0.45,
    onUsage: (usage) => openRouterUsage.push(usage),
  });
  const parsed = parseAndRepairJson<Record<string, unknown>>(content);
  const directorPlan = normalizeDirectorSegmentPlan(parsed);
  const directorBrief = normalizeDirectorBrief(parsed.director_brief ?? parsed.directorBrief);
  if (!directorPlan || !directorBrief) {
    throw new LlmPromptChainFailure("director_segmenter", "Unified Gemini response is missing director_brief or director plan", {
      adaptationPlan: input.adaptationPlan,
      contentContract: input.contentContract,
    });
  }
  const script = normalizeRussianSpeechGender(
    sanitizeOmniScriptText(spellPromptChainNumbersInText(formatScenarioScript(directorPlan.totalVoiceover))),
    input.avatarSpeechGender,
  );
  assertOmniScriptTextContract(script);
  assertRussianSpeechGender(script, input.avatarSpeechGender);
  validateCreativeScriptQuality(input, script, { hook: directorPlan.selectedHook });
  const providerPlan = buildProviderPromptPlanFromDirector(directorPlan);
  const productTimeline = directorPlan.segments.flatMap((segment) =>
    segment.storyboardFrames.map((frame) => frame.productBeat === true)
  );
  if (!hasSingleContiguousTrueInterval(productTimeline)) {
    throw new LlmPromptChainFailure("provider_plan_validation", "Unified plan must contain exactly one contiguous product interval", {
      adaptationPlan: input.adaptationPlan,
      contentContract: input.contentContract,
      directorSegmentPlan: directorPlan,
    });
  }
  const validationIssues = [
    ...validateDirectorSegmentPlan(directorPlan),
    ...validateStoryboardDirectorPlan(directorPlan),
    ...validateProviderPromptPlan(providerPlan),
    ...validateStoryboardProviderPlan(providerPlan),
    ...validateStoryboardProviderAlignment(directorPlan, providerPlan),
  ];
  const errors = validationIssues.filter((issue) => issue.severity === "error");
  if (errors.length) {
    throw new LlmPromptChainFailure("provider_plan_validation", formatPromptValidationIssues(errors), {
      adaptationPlan: input.adaptationPlan,
      contentContract: input.contentContract,
      directorSegmentPlan: directorPlan,
    });
  }
  const beatSheet: OmniBeatSheet = {
    version: "omni-beat-sheet-v1",
    items: directorPlan.segments.flatMap((segment) => segment.storyboardFrames.map((frame, offset) => ({
      id: `segment_${segment.index}_frame_${frame.index}`,
      segmentIndex: segment.index,
      frameIndex: frame.index,
      startSeconds: offset * 2,
      endSeconds: (offset + 1) * 2,
      spokenWords: frame.spokenWords,
      stage: frame.productBeat ? "product" : segment.index === 1 && frame.index === 1 ? "hook" : "body",
      productMentioned: frame.productBeat === true,
      visualRole: frame.productBeat ? "product" : frame.referenceRole === "avatar" ? "avatar" : "avatar_or_environment",
      visualInstruction: frame.visualDescription,
    }))),
  };
  const selfCheck = isRecordValue(parsed.self_check) ? parsed.self_check : {};
  const semanticPassed = [
    "topic_preserved",
    "hook_promise_preserved",
    "presentation_frame_preserved",
    "product_integration_causal",
    "single_product_interval",
    "speech_alignment_exact",
  ].every((key) => selfCheck[key] === true);
  if (!semanticPassed) {
    throw new LlmPromptChainFailure("creative_copywriter", "Unified Gemini self-check did not pass", {
      adaptationPlan: input.adaptationPlan,
      contentContract: input.contentContract,
      directorSegmentPlan: directorPlan,
    });
  }
  const semanticReview: ScriptSemanticReview = {
    version: "script-semantic-review-v2",
    passed: semanticPassed,
    productNamed: true,
    productValueStated: true,
    hookAnswered: true,
    finalAnswerPresent: true,
    productNaturallyIntegrated: true,
    referenceMeaningPreserved: true,
    evidence: { product: "", value: "", answer: "", transition: "" },
    issues: [], repairInstructions: [], defects: [], warnings: [],
  };
  const referenceAnalysis = isRecordValue(parsed.reference_analysis) ? parsed.reference_analysis : null;
  const spokenTranscript = typeof parsed.spoken_transcript === "string" ? parsed.spoken_transcript.trim() : null;
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
        visualCue: segment.storyboardFrames.map((frame) => `${frame.role}: ${frame.visualDescription}`).join(". "),
        voiceover: segment.voiceover,
      })),
      snapshot: {
        version: LLM_PROMPT_CHAIN_VERSION,
        adaptationPlan: input.adaptationPlan,
        contentContract: input.contentContract,
        creativeScriptDraft: { version: LLM_PROMPT_CHAIN_VERSION, script, hookAngle: directorPlan.selectedHook, creativeNotes: null },
        beatSheet,
        directorSegmentPlan: directorPlan,
        providerPromptPlan: providerPlan,
        semanticReview,
        validationIssues,
        referenceAnalysis,
        directorBrief,
        spokenTranscript,
      },
    },
    openRouterUsage,
  };
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasSingleContiguousTrueInterval(values: readonly boolean[]) {
  const first = values.indexOf(true);
  if (first < 0) return false;
  const last = values.lastIndexOf(true);
  return values.slice(first, last + 1).every(Boolean);
}

async function runLegacyLlmPromptChain(input: PromptChainInput & { model: string }): Promise<{
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
    creativeResult = await runCreativeCopywriter(chainInput, onUsage, (request) => requestOpenRouter({
      input: chainInput, layer: "creative_copywriter", responseFormatJson: true, onUsage, ...request,
    }));
  } catch (error) {
    if (error instanceof CreativeCopywriterFailure) {
      throw new LlmPromptChainFailure("creative_copywriter", error.message, { adaptationPlan, contentContract, ...error.partialSnapshot });
    }
    if (error instanceof LlmPromptChainFailure) throw error;
    throw new LlmPromptChainFailure("creative_copywriter", getErrorMessage(error), { adaptationPlan, contentContract });
  }
  const draft = creativeResult.draft;
  const beatSheet = buildOmniBeatSheet({
    segments: creativeResult.segmentPlan.segments.map((segment, index) => ({
      index: index + 1,
      durationSeconds: creativeResult.segmentPlan.segmentDurationsSeconds[index],
      voiceover: segment.text,
    })),
    productName: input.productName,
  });
  let directorResult: Awaited<ReturnType<typeof runDirectorSegmenter>>;
  try {
    directorResult = await runDirectorSegmenter(chainInput, draft, creativeResult.segmentPlan, beatSheet, onUsage);
  } catch (error) {
    const directorFailure = error instanceof DirectorSegmenterFailure ? error : null;
    throw new LlmPromptChainFailure("director_segmenter", getErrorMessage(error), {
      adaptationPlan,
      contentContract,
      creativeScriptDraft: draft,
      semanticReview: creativeResult.semanticReview,
      creativeAttemptDiagnostics: creativeResult.diagnostics,
      beatSheet,
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
      creativeAttemptDiagnostics: creativeResult.diagnostics,
      beatSheet,
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
        beatSheet,
        directorSegmentPlan: directorPlan,
        providerPromptPlan: providerPlan,
        semanticReview: creativeResult.semanticReview,
        creativeAttemptDiagnostics: creativeResult.diagnostics,
        validationIssues: [...directorResult.validationIssues, ...providerValidationIssues],
      },
    },
    openRouterUsage,
  };
}
async function runDirectorSegmenter(
  input: PromptChainInput & { model: string },
  draft: CreativeScriptDraft,
  segmentPlan: OmniReelSegmentPlan,
  beatSheet: OmniBeatSheet,
  onUsage: (usage: OpenRouterUsageRecord) => void
) {
  const format = resolveDirectorSegmentFormat(input.directorBrief);
  const basePrompt = buildDirectorSegmenterPrompt({ chainInput: input, draft, segmentPlan, beatSheet });
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
      const beatSheetIssues = validateOmniBeatSheetAlignment(plan, beatSheet);
      if (beatSheetIssues.length) {
        validationIssues.push({
          path: "director.beatSheet",
          code: "beat_sheet_alignment",
          message: beatSheetIssues.join("; "),
          severity: "error",
        });
      }
      const errors = validationIssues.filter((issue) => issue.severity === "error");
      if (errors.length) {
        const reason = formatPromptValidationIssues(errors);
        attemptDiagnostic = { ...attemptDiagnostic, status: "contract_invalid", error: reason };
        throw new Error(reason);
      }
      validateCreativeScriptQuality(input, finalScript, { hook: plan.selectedHook });
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
  systemPrompt?: string;
  videoUrl?: string;
  responseFormatJson: boolean;
  maxTokens?: number;
  temperature?: number;
  onUsage: (usage: OpenRouterUsageRecord) => void;
}) {
  const apiKey = process.env.OPENROUTER_API_KEY || "";
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");
  const body: Record<string, unknown> = {
    model: input.input.model,
    temperature: input.temperature ?? PROMPT_CHAIN_TEMPERATURE,
    max_tokens: input.maxTokens || (input.responseFormatJson ? 12_000 : 4_000),
    messages: [
      {
        role: "system",
        content: input.systemPrompt || (input.responseFormatJson
          ? "Верни только валидный JSON без markdown."
          : "Верни только запрошенный текст без markdown и пояснений."),
      },
      { role: "user", content: input.videoUrl ? [
        { type: "text", text: input.userPrompt },
        { type: "video_url", video_url: { url: input.videoUrl } },
      ] : input.userPrompt },
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
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const firstChoice = choices[0] && typeof choices[0] === "object" ? choices[0] as Record<string, unknown> : null;
  if (firstChoice?.finish_reason === "length") {
    throw new Error("Unified Gemini JSON was truncated by the provider token limit");
  }
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
