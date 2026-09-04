import type { DirectorBrief } from "./director-analysis-types";
import type { OmniSegmentPrompt } from "./omni-prompt-builder";
import type { OmniStoryboardFrame } from "../../omni/storyboard/omni-storyboard-types";
import { isProductPlacementVisible } from "./omni-intro-product-contract";
import { buildPhysicalFramePlan } from "./physical-scene-model";
import { withReferenceSceneMode } from "./omni-reference-scene-mode";

export function adaptDirectorBriefForAvatarReel(brief: DirectorBrief | null | undefined) {
  if (!brief) return null;
  return {
    ...brief,
    referenceSceneMode: "presenter" as const,
    reference_subject_mode: "presenter" as const,
    visible_subject_policy: "presenter" as const,
  };
}

export function ensureTalkingAvatarInPromptPlan(plan: readonly OmniSegmentPrompt[], productName: string) {
  const productFrames = plan.map((segment) => (segment.storyboardPlan?.frames || []).map((frame, index) =>
    segment.creativePlan.productVisibleByFrame?.[index] === true ||
    frame.referenceTransfer?.productMeaningfulBeat === true ||
    Boolean(frame.physicalPlan?.visibleEntityIds.length) ||
    isProductPlacementVisible(frame.productPlacement, productName) ||
    Boolean(buildPhysicalFramePlan({ productName, spokenText: frame.spokenText,
      visualAction: frame.visualAction, camera: frame.camera, productPlacement: frame.productPlacement,
      speechMode: frame.speechMode,
    }).visibleEntityIds.length)
  ));
  if (plan.some((segment, segmentIndex) => segment.storyboardPlan?.frames.some((frame, frameIndex) =>
    !productFrames[segmentIndex][frameIndex] && Boolean(frame.spokenText.trim()) &&
    (frame.speechMode || frame.physicalPlan?.speechMode) === "on_camera"
  ))) return plan;

  const segmentIndex = plan.findIndex((segment, index) => segment.storyboardPlan?.frames.some((frame, frameIndex) =>
    !productFrames[index][frameIndex] && Boolean(frame.spokenText.trim())
  ));
  if (segmentIndex < 0) throw new Error("Для разговорного аватара нужен отдельный кадр без продукта. Товарные B-roll сохранены; измените план кадров.");
  const target = plan[segmentIndex];
  const frameIndex = target.storyboardPlan!.frames.findIndex((frame, index) =>
    !productFrames[segmentIndex][index] && Boolean(frame.spokenText.trim())
  );
  return plan.map((segment, index) => ({
    ...segment,
    creativeStrategy: withReferenceSceneMode(segment.creativeStrategy, "presenter"),
    ...(index === segmentIndex ? {
      creativePlan: {
        ...segment.creativePlan,
        productVisibleByFrame: segment.creativePlan.productVisibleByFrame || productFrames[index],
      },
      storyboardPlan: {
        ...segment.storyboardPlan!,
        frames: segment.storyboardPlan!.frames.map((frame, position) =>
          position === frameIndex ? buildTalkingAvatarFrame(frame, productName) : frame
        ),
      },
    } : {}),
  }));
}

function buildTalkingAvatarFrame(frame: OmniStoryboardFrame, productName: string): OmniStoryboardFrame {
  const visualAction = "сохранённый аватар спокойно говорит в камеру, смотрит в объектив; руки пустые и спокойно опущены";
  const supportProps = frame.referenceTransfer?.requiredSupportProps || [];
  const camera = ["средний крупный план аватара на уровне глаз, неподвижная камера",
    supportProps.length ? `в прежнем окружении остаются неподвижные фоновые предметы: ${supportProps.join(", ")}` : "",
  ].filter(Boolean).join("; ");
  const adapted: OmniStoryboardFrame = {
    ...frame, visualAction, camera, speechMode: "on_camera",
    sfxNotes: "непрерывная живая речь и тихий звук прежнего окружения", effectNotes: null,
    referenceTransfer: frame.referenceTransfer ? {
      ...frame.referenceTransfer,
      cameraComposition: camera,
      requiredReferenceAction: visualAction,
      decisions: { ...frame.referenceTransfer.decisions, presenterAction: "adapt_to_talking_avatar" },
    } : frame.referenceTransfer,
  };
  return { ...adapted, physicalPlan: buildPhysicalFramePlan({
    productName, spokenText: adapted.spokenText, visualAction, camera,
    productPlacement: adapted.productPlacement, speechMode: "on_camera",
  }) };
}
