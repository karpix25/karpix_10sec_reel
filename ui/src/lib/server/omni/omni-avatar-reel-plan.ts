import type { DirectorBrief } from "./director-analysis-types";
import type { OmniSegmentPrompt } from "./omni-prompt-builder";

export function adaptDirectorBriefForAvatarReel(brief: DirectorBrief | null | undefined) {
  if (!brief) return null;
  return {
    ...brief,
    referenceSceneMode: "presenter" as const,
    reference_subject_mode: "presenter" as const,
    visible_subject_policy: "presenter" as const,
  };
}

export function assertAvatarNarratorPlan(plan: readonly OmniSegmentPrompt[]) {
  const missing = plan
    .filter((segment) => !segment.storyboardPlan?.frames.some((frame) => frame.narratorVisible === true && Boolean(frame.spokenText.trim())))
    .map((segment) => segment.index);
  if (missing.length) {
    throw new Error(`В каждом segment нужен видимый аватар, ведущий повествование; отсутствует: ${missing.join(", ")}`);
  }
}
