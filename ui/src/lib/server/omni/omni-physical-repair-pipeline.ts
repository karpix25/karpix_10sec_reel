import type { OmniStoryboardSegment } from "../../omni/storyboard/omni-storyboard-types";
import { validateOmniStoryboardSegment } from "../../omni/storyboard/omni-storyboard-contract";
import type { DirectorBrief } from "./director-analysis-types";
import type { OmniSegmentPrompt } from "./omni-prompt-builder";
import {
  repairPhysicalStoryboardSegment,
  type PhysicalStoryboardFramePatch,
} from "./physical-storyboard-ai-repair";
import { repairPhysicalScenePrompt, validatePhysicalScene } from "./physical-scene-validator";
import { normalizePhysicalStoryboardSegment } from "./physical-storyboard-normalizer";
import { renderCompactRussianOmniStoryboardPrompt } from "./storyboard/omni-storyboard-renderer";

const MAX_AI_REPAIR_ATTEMPTS_PER_SEGMENT = 2;

export async function repairOmniPromptPlanWithAi(input: {
  promptPlan: readonly OmniSegmentPrompt[];
  productName: string;
  productPhysicalContract?: string | null;
  segmentCount: number;
  directorBrief?: DirectorBrief | null;
  model?: string | null;
}) {
  const repairedPlan = [...input.promptPlan];

  for (let index = 0; index < repairedPlan.length; index += 1) {
    let segment = repairedPlan[index];
    if (!segment.storyboardPlan || segment.validation?.valid !== false) continue;

    let storyboard = normalizePhysicalStoryboardSegment({
      storyboard: segment.storyboardPlan,
      productName: input.productName,
    });
    let validation = validatePhysicalScene({
      storyboard,
      creativePlan: segment.creativePlan,
      productName: input.productName,
    });
    repairedPlan[index] = buildRepairedSegment({
      segment,
      storyboard,
      validation,
      productName: input.productName,
      productPhysicalContract: input.productPhysicalContract,
      segmentCount: input.segmentCount,
      directorBrief: input.directorBrief,
    });
    if (validation.valid) continue;

    for (let attempt = 0; attempt < MAX_AI_REPAIR_ATTEMPTS_PER_SEGMENT && !validation.valid; attempt += 1) {
      const result = await repairPhysicalStoryboardSegment({
        segment: storyboard,
        productName: input.productName,
        validationErrors: validation.errors,
        model: input.model,
      });
      if (!result.patch.frames.length) break;

      storyboard = normalizePhysicalStoryboardSegment({
        storyboard: applyPatch(storyboard, result.patch.frames),
        productName: input.productName,
      });
      validation = validatePhysicalScene({
        storyboard,
        creativePlan: segment.creativePlan,
        productName: input.productName,
      });
      const storyboardValidation = validateOmniStoryboardSegment(storyboard);
      if (!storyboardValidation.valid) break;

      segment = buildRepairedSegment({
        segment,
        storyboard,
        validation,
        productName: input.productName,
        productPhysicalContract: input.productPhysicalContract,
        segmentCount: input.segmentCount,
        directorBrief: input.directorBrief,
      });
      repairedPlan[index] = segment;
    }
  }

  return repairedPlan;
}

function buildRepairedSegment(input: {
  segment: OmniSegmentPrompt;
  storyboard: OmniStoryboardSegment;
  validation: ReturnType<typeof validatePhysicalScene>;
  productName: string;
  productPhysicalContract?: string | null;
  segmentCount: number;
  directorBrief?: DirectorBrief | null;
}): OmniSegmentPrompt {
  return {
    ...input.segment,
    prompt: repairPhysicalScenePrompt(renderCompactRussianOmniStoryboardPrompt({
      storyboard: input.storyboard,
      productName: input.productName,
      productPhysicalContract: input.segment.creativePlan.productRole !== "hidden"
        ? input.productPhysicalContract
        : null,
      segmentCount: input.segmentCount,
      directorBrief: input.directorBrief,
    }), input.validation),
    storyboardPlan: input.storyboard,
    validation: input.validation,
  };
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
