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
import type { ReferenceSceneMode } from "./omni-reference-scene-mode";

const MAX_AI_REPAIR_ATTEMPTS_PER_SEGMENT = 1;

export function normalizeOmniPromptPlanWithPhysicalRules(input: {
  promptPlan: readonly OmniSegmentPrompt[];
  productName: string;
  productPhysicalContract?: string | null;
  segmentCount: number;
  directorBrief?: DirectorBrief | null;
  referenceSceneMode?: ReferenceSceneMode;
}) {
  const fixedWardrobe = input.directorBrief?.wardrobe_continuity === "stable"
    ? input.promptPlan.find((segment) => segment.storyboardPlan?.frames[0]?.wardrobe)
      ?.storyboardPlan?.frames[0]?.wardrobe || ""
    : "";
  return input.promptPlan.map((segment) => {
    if (!segment.storyboardPlan) return segment;

    const storyboard = normalizePhysicalStoryboardSegment({
      storyboard: fixedWardrobe
        ? {
            ...segment.storyboardPlan,
            frames: segment.storyboardPlan.frames.map((frame) => ({ ...frame, wardrobe: fixedWardrobe })),
          }
        : segment.storyboardPlan,
      productName: input.productName,
      productVisible: segment.creativePlan.productRole !== "hidden",
      productVisibleByFrame: segment.creativePlan.productVisibleByFrame,
      productRole: segment.creativePlan.productRole,
      referenceSceneMode: input.referenceSceneMode,
    });
    const validation = validatePhysicalScene({
      storyboard,
      creativePlan: segment.creativePlan,
      productName: input.productName,
    });
    const normalizedChanged = JSON.stringify(segment.storyboardPlan) !== JSON.stringify(storyboard);
    if (!normalizedChanged && validation.valid && segment.validation?.valid) return segment;

    return buildRepairedSegment({
      segment,
      storyboard,
      validation,
      productName: input.productName,
      productPhysicalContract: input.productPhysicalContract,
      segmentCount: input.segmentCount,
      directorBrief: input.directorBrief,
      referenceSceneMode: input.referenceSceneMode,
    });
  });
}

export async function repairOmniPromptPlanWithAi(input: {
  promptPlan: readonly OmniSegmentPrompt[];
  productName: string;
  productPhysicalContract?: string | null;
  segmentCount: number;
  directorBrief?: DirectorBrief | null;
  referenceSceneMode?: ReferenceSceneMode;
  model?: string | null;
}) {
  const repairedPlan = normalizeOmniPromptPlanWithPhysicalRules(input);

  for (let index = 0; index < repairedPlan.length; index += 1) {
    let segment = repairedPlan[index];
    if (!segment.storyboardPlan || segment.validation?.valid) continue;

    let storyboard = segment.storyboardPlan;
    let validation = segment.validation;
    if (!validation) continue;

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
        productVisible: segment.creativePlan.productRole !== "hidden",
        productVisibleByFrame: segment.creativePlan.productVisibleByFrame,
        productRole: segment.creativePlan.productRole,
        referenceSceneMode: input.referenceSceneMode,
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
        referenceSceneMode: input.referenceSceneMode,
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
  referenceSceneMode?: ReferenceSceneMode;
}): OmniSegmentPrompt {
  const prompt = repairPhysicalScenePrompt(renderCompactRussianOmniStoryboardPrompt({
    storyboard: input.storyboard,
    productName: input.productName,
    productPhysicalContract: input.segment.creativePlan.productRole !== "hidden"
      && input.segment.creativePlan.productRole !== "digital_demo"
      ? input.productPhysicalContract
      : null,
    productRole: input.segment.creativePlan.productRole,
    segmentCount: input.segmentCount,
    directorBrief: input.directorBrief,
    referenceSceneMode: input.referenceSceneMode,
  }), input.validation);
  return {
    ...input.segment,
    prompt,
    storyboardPlan: input.storyboard,
    storyboardValidation: validateOmniStoryboardSegment(input.storyboard),
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
