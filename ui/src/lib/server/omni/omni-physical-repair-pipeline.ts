import type { OmniStoryboardSegment } from "../../omni/storyboard/omni-storyboard-types";
import { validateOmniStoryboardSegment } from "../../omni/storyboard/omni-storyboard-contract";
import type { DirectorBrief } from "./director-analysis-types";
import type { OmniSegmentPrompt } from "./omni-prompt-builder";
import {
  repairPhysicalStoryboardSegment,
  type PhysicalStoryboardFramePatch,
} from "./physical-storyboard-ai-repair";
import { repairPhysicalScenePrompt, validatePhysicalScene } from "./physical-scene-validator";
import { renderCompactRussianOmniStoryboardPrompt } from "./storyboard/omni-storyboard-renderer";

const MAX_AI_REPAIR_CALLS = 2;

export async function repairOmniPromptPlanWithAi(input: {
  promptPlan: readonly OmniSegmentPrompt[];
  productName: string;
  productPhysicalContract?: string | null;
  segmentCount: number;
  directorBrief?: DirectorBrief | null;
  model?: string | null;
}) {
  const repairedPlan = [...input.promptPlan];
  let calls = 0;

  for (let index = 0; index < repairedPlan.length && calls < MAX_AI_REPAIR_CALLS; index += 1) {
    const segment = repairedPlan[index];
    if (!segment.storyboardPlan || segment.validation?.valid !== false) continue;

    const result = await repairPhysicalStoryboardSegment({
      segment: segment.storyboardPlan,
      productName: input.productName,
      validationErrors: segment.validation.errors,
      model: input.model,
    });
    calls += 1;
    if (!result.patch.frames.length) continue;

    const storyboard = applyPatch(segment.storyboardPlan, result.patch.frames);
    const physicalValidation = validatePhysicalScene({
      storyboard,
      creativePlan: segment.creativePlan,
      productName: input.productName,
    });
    const storyboardValidation = validateOmniStoryboardSegment(storyboard);
    if (!storyboardValidation.valid) continue;

    repairedPlan[index] = {
      ...segment,
      prompt: repairPhysicalScenePrompt(renderCompactRussianOmniStoryboardPrompt({
        storyboard,
        productName: input.productName,
        productPhysicalContract: segment.creativePlan.productRole !== "hidden"
          ? input.productPhysicalContract
          : null,
        segmentCount: input.segmentCount,
        directorBrief: input.directorBrief,
      }), physicalValidation),
      storyboardPlan: storyboard,
      validation: physicalValidation,
    };
  }

  return repairedPlan;
}

function applyPatch(
  storyboard: OmniStoryboardSegment,
  patches: readonly PhysicalStoryboardFramePatch[]
): OmniStoryboardSegment {
  const patchByFrame = new Map(patches.map((patch) => [patch.frameIndex, patch]));
  return {
    ...storyboard,
    frames: storyboard.frames.map((frame, index) => {
      const patch = patchByFrame.get(index + 1);
      if (!patch) return frame;
      return {
        ...frame,
        ...(patch.visualAction === undefined ? {} : { visualAction: patch.visualAction }),
        ...(patch.productPlacement === undefined ? {} : { productPlacement: patch.productPlacement }),
        ...(patch.sfxNotes === undefined ? {} : { sfxNotes: patch.sfxNotes }),
        ...(patch.effectNotes === undefined ? {} : { effectNotes: patch.effectNotes }),
      };
    }),
  };
}
