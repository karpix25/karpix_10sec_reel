import type { OmniScriptBeatCue } from "@/lib/omni/creative-contract";
import { type AudioMood } from "@/lib/audio-library/moods";
import type { OpenRouterUsageRecord } from "@/lib/omni/openrouter-cost";
import { sanitizeOmniScriptText } from "./omni-script-text-contract";
import { validateViralScriptContract, type ScriptQualityResult } from "./script-quality-contract";
import { runLlmPromptChain } from "./llm-prompt-chain-runner";
import type { PromptChainInput } from "./llm-prompt-chain-prompts";
import type { LlmPromptChainSnapshot, ScriptSemanticReview } from "./llm-prompt-chain-types";

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

export async function generateScript(input: PromptChainInput & { model: string }): Promise<{
  payload: GeneratedScriptResultPayload;
  qualityCheck: ScriptQualityResult;
  semanticReview: ScriptSemanticReview | null;
  openRouterUsage: OpenRouterUsageRecord[];
  llmPromptChainSnapshot?: LlmPromptChainSnapshot;
}> {
  // All callers use the same bounded writer/review pipeline, including installations with an old feature flag.
  const generated = await runLlmPromptChain(input);
  const payload: GeneratedScriptResultPayload = {
    title: sanitizeOmniScriptText(generated.result.title || "Новый сценарий"),
    hook_options: generated.result.hookOptions,
    selected_hook: sanitizeOmniScriptText(generated.result.selectedHook),
    hook: sanitizeOmniScriptText(generated.result.selectedHook),
    beats: generated.result.beats.map((beat) => ({
      stage: beat.stage, visualCue: sanitizeOmniScriptText(beat.visualCue), voiceover: beat.voiceover,
    })),
    script: generated.result.script,
    caption: sanitizeOmniScriptText(generated.result.caption),
    cta_keyword: sanitizeOmniScriptText(generated.result.ctaKeyword),
    lead_magnet: sanitizeOmniScriptText(generated.result.leadMagnet),
    background_audio_mood: generated.result.backgroundAudioMood,
    semantic_review: generated.result.snapshot.semanticReview,
  };
  const qualityCheck = validateViralScriptContract({
    script: payload.script, rawScriptBeforeCta: payload.script, rawScriptFromModel: payload.script,
    hook: payload.hook || null, productName: input.productName,
    ctaMode: input.ctaMode, ctaValue: input.ctaValue, durationRange: input.durationRange,
    referenceScript: input.sourceScenario.script, adaptationMode: input.adaptationPlan.mode,
  });
  return {
    payload, qualityCheck, semanticReview: payload.semantic_review,
    openRouterUsage: generated.openRouterUsage, llmPromptChainSnapshot: generated.result.snapshot,
  };
}
