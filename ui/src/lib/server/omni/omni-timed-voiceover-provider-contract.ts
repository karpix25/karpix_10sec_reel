import type { ProviderPromptPlan } from "./llm-prompt-chain-types";
import { sanitizeOmniScriptText } from "./omni-script-text-contract";
import type { OmniTimedVoiceoverPlan } from "./omni-timed-voiceover-plan";

export function assertProviderPlanUsesTimedVoiceover(
  providerPromptPlan: ProviderPromptPlan,
  timedVoiceoverPlan: OmniTimedVoiceoverPlan,
) {
  if (providerPromptPlan.segmentPrompts.length !== timedVoiceoverPlan.segments.length) {
    throw new Error("Stored provider plan segment count does not match timed voiceover plan");
  }
  for (const [index, providerSegment] of providerPromptPlan.segmentPrompts.entries()) {
    const timedSegment = timedVoiceoverPlan.segments[index];
    if (
      providerSegment.index !== timedSegment.index ||
      providerSegment.durationSeconds !== timedSegment.durationSeconds ||
      sanitizeOmniScriptText(providerSegment.voiceover) !== timedSegment.text
    ) {
      throw new Error(`Stored provider plan segment ${index + 1} does not match timed voiceover plan`);
    }
  }
}
