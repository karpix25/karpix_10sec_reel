import { detectAudioMoodFromText, normalizeAudioMood } from "@/lib/audio-library/moods";
import {
  normalizeOpenRouterUsage,
  type OpenRouterUsageLayer,
  type OpenRouterUsageRecord,
} from "@/lib/omni/openrouter-cost";
import { formatScenarioScript } from "@/lib/scenario-text";
import { assertOmniScriptTextContract, sanitizeOmniScriptText } from "./omni-script-text-contract";
import { ensureOmniScriptCta } from "./omni-cta-contract";
import { getOpenRouterPricingSnapshot } from "./openrouter-pricing";
import { parseAndRepairJson } from "./script-json-repair";
import { validateViralScriptContract } from "./script-quality-contract";
import {
  LLM_PROMPT_CHAIN_VERSION,
  type CreativeScriptDraft,
  type DirectorSegmentPlan,
  type LlmPromptChainResult,
} from "./llm-prompt-chain-types";
import {
  buildCreativeCopywriterPrompt,
  buildDirectorSegmenterPrompt,
  buildProviderPromptWriterPrompt,
  type PromptChainInput,
} from "./llm-prompt-chain-prompts";
import {
  normalizeCreativeScriptDraft,
  normalizeDirectorSegmentPlan,
  normalizeProviderPromptPlan,
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

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const PROMPT_CHAIN_ATTEMPTS_PER_LAYER = 2;
const PROMPT_CHAIN_TEMPERATURE = 0.8;

export function isLlmPromptChainEnabled() {
  return process.env.OMNI_LLM_PROMPT_CHAIN === "true";
}

export async function runLlmPromptChain(input: PromptChainInput & { model: string }): Promise<{
  result: LlmPromptChainResult;
  openRouterUsage: OpenRouterUsageRecord[];
}> {
  const openRouterUsage: OpenRouterUsageRecord[] = [];
  const onUsage = (usage: OpenRouterUsageRecord) => openRouterUsage.push(usage);

  const draft = await runCreativeCopywriter(input, onUsage);
  const directorPlan = await runDirectorSegmenter(input, draft, onUsage);
  const providerPlan = await runProviderPromptWriter(input, directorPlan, onUsage);
  const script = sanitizeOmniScriptText(formatScenarioScript(directorPlan.totalVoiceover));
  assertOmniScriptTextContract(script);

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
        creativeScriptDraft: draft,
        directorSegmentPlan: directorPlan,
        providerPromptPlan: providerPlan,
        validationIssues: [],
      },
    },
    openRouterUsage,
  };
}

async function runCreativeCopywriter(
  input: PromptChainInput & { model: string },
  onUsage: (usage: OpenRouterUsageRecord) => void
) {
  let retryFeedback = "";
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= PROMPT_CHAIN_ATTEMPTS_PER_LAYER; attempt += 1) {
    try {
      const content = await requestOpenRouter({
        input,
        layer: "creative_copywriter",
        attempt,
        userPrompt: appendRetry(buildCreativeCopywriterPrompt(input), retryFeedback),
        responseFormatJson: false,
        onUsage,
      });
      const draft = normalizeCreativeScriptDraft(content);
      if (!draft) throw new Error("Creative copywriter returned empty script");
      const script = sanitizeOmniScriptText(formatScenarioScript(draft.script));
      assertPromptChainScriptQuality(input, script, null);
      return {
        ...draft,
        script,
      };
    } catch (error) {
      lastError = error;
      retryFeedback = `Верни только текст сценария. Ошибка прошлой попытки: ${getErrorMessage(error)}`;
    }
  }
  throw new Error(`Creative copywriter failed: ${getErrorMessage(lastError)}`);
}

async function runDirectorSegmenter(
  input: PromptChainInput & { model: string },
  draft: CreativeScriptDraft,
  onUsage: (usage: OpenRouterUsageRecord) => void
) {
  let retryFeedback = "";
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= PROMPT_CHAIN_ATTEMPTS_PER_LAYER; attempt += 1) {
    try {
      const content = await requestOpenRouter({
        input,
        layer: "director_segmenter",
        attempt,
        userPrompt: appendRetry(buildDirectorSegmenterPrompt({ chainInput: input, draft }), retryFeedback),
        responseFormatJson: true,
        onUsage,
      });
      const plan = normalizeDirectorSegmentPlan(parseAndRepairJson(content));
      if (!plan) throw new Error("Director segmenter returned invalid JSON plan");
      const finalScript = sanitizeOmniScriptText(formatScenarioScript(plan.totalVoiceover));
      const ensuredCta = ensureOmniScriptCta(finalScript, input.ctaMode, input.ctaValue);
      if (ensuredCta !== finalScript) throw new Error("Director plan is missing the required CTA");
      const issues = [
        ...validateDirectorSegmentPlan(plan),
        ...validateStoryboardDirectorPlan(plan),
      ].filter((issue) => issue.severity === "error");
      if (issues.length) throw new Error(formatPromptValidationIssues(issues));
      assertPromptChainScriptQuality(input, finalScript, plan.selectedHook);
      return plan;
    } catch (error) {
      lastError = error;
      retryFeedback = buildValidationRetry("director plan", error);
    }
  }
  throw new Error(`Director segmenter failed: ${getErrorMessage(lastError)}`);
}

async function runProviderPromptWriter(
  input: PromptChainInput & { model: string },
  directorPlan: DirectorSegmentPlan,
  onUsage: (usage: OpenRouterUsageRecord) => void
) {
  let retryFeedback = "";
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= PROMPT_CHAIN_ATTEMPTS_PER_LAYER; attempt += 1) {
    try {
      const content = await requestOpenRouter({
        input,
        layer: "provider_prompt_writer",
        attempt,
        userPrompt: appendRetry(buildProviderPromptWriterPrompt({ chainInput: input, directorPlan }), retryFeedback),
        responseFormatJson: true,
        onUsage,
      });
      const plan = normalizeProviderPromptPlan(parseAndRepairJson(content));
      if (!plan) throw new Error("Provider prompt writer returned invalid JSON plan");
      const issues = [
        ...validateProviderPromptPlan(plan),
        ...validateStoryboardProviderPlan(plan),
        ...validateStoryboardProviderAlignment(directorPlan, plan),
      ].filter((issue) => issue.severity === "error");
      if (issues.length) throw new Error(formatPromptValidationIssues(issues));
      return plan;
    } catch (error) {
      lastError = error;
      retryFeedback = buildValidationRetry("provider prompts", error);
    }
  }
  throw new Error(`Provider prompt writer failed: ${getErrorMessage(lastError)}`);
}

async function requestOpenRouter(input: {
  input: PromptChainInput & { model: string };
  layer: OpenRouterUsageLayer;
  attempt: number;
  userPrompt: string;
  responseFormatJson: boolean;
  onUsage: (usage: OpenRouterUsageRecord) => void;
}) {
  const apiKey = process.env.OPENROUTER_API_KEY || "";
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");
  const body: Record<string, unknown> = {
    model: input.input.model,
    temperature: PROMPT_CHAIN_TEMPERATURE,
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
  });
}

function appendRetry(prompt: string, retryFeedback: string) {
  return retryFeedback ? `${prompt}\n\nПовторная попытка:\n${retryFeedback}` : prompt;
}

function buildValidationRetry(layer: string, error: unknown) {
  return [
    `Перепиши ${layer}.`,
    `Исправь только найденные нарушения: ${getErrorMessage(error)}`,
    "Не используй emoji, дефисы, тире, минусы и цифры в текстовых значениях.",
    "Сохрани живую речь и цельный режиссерский замысел.",
  ].join(" ");
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
