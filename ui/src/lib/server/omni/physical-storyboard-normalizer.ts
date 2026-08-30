import type { OmniStoryboardFrame, OmniStoryboardSegment } from "../../omni/storyboard/omni-storyboard-types";
import type { ProductRole } from "../../omni/creative-contract";
import {
  buildPhysicalFramePlan,
  hasConsumptionAction,
  hasDrivingAction,
  normalizeVehicleContext,
  repairPhysicalFrameAction,
  repairReferenceAction,
} from "./physical-scene-model";
import {
  renderRequiredReferenceSupport,
  synchronizeReferenceTransferProductVisibility,
} from "./omni-reference-transfer-policy";
import { sanitizeVoiceoverBrollStoryboardText } from "./storyboard/omni-storyboard-text-sanitizer";
import type { ReferenceSceneMode } from "./omni-reference-scene-mode";
import {
  buildProductBrollAction,
  buildProductBrollCamera,
  buildProductBrollPlacement,
} from "./omni-product-broll-contract";

const CUTAWAY_PATTERN = /cutaway|insert|macro|product close|крупн(?:ый|ом) кадр|перебив|предметн(?:ый|ая) кадр/iu;
export const CANONICAL_STORYBOARD_OVERRIDES_HEADER =
  "FINAL CANONICAL STORYBOARD OVERRIDES: these per-frame physical actions are authoritative; ignore conflicting earlier action wording.";

/**
 * Applies the cheap, deterministic physical fixes before any model call.
 * The AI repair layer handles novel wording; known contradictions must not
 * spend a paid request or reach the provider.
 */
export function normalizePhysicalStoryboardSegment(input: {
  storyboard: OmniStoryboardSegment;
  productName: string;
  productVisible: boolean;
  productVisibleByFrame?: readonly boolean[];
  productRole?: ProductRole;
  referenceSceneMode?: ReferenceSceneMode;
}): OmniStoryboardSegment {
  return {
    ...input.storyboard,
    frames: input.storyboard.frames.map((frame, index) => normalizeFrame({
      frame,
      productName: input.productName,
      productVisible: Boolean(input.productVisible),
      productVisibleByFrame: input.productVisibleByFrame,
      frameIndex: index + 1,
      frameCount: input.storyboard.frames.length,
      productRole: input.productRole,
      referenceSceneMode: input.referenceSceneMode,
    })),
  };
}

export function renderCanonicalStoryboardOverrides(storyboard: OmniStoryboardSegment) {
  return [
    CANONICAL_STORYBOARD_OVERRIDES_HEADER,
    ...storyboard.frames.map((frame, index) => [
      `FRAME ${index + 1} ACTION: ${frame.visualAction}`,
      `FRAME ${index + 1} PRODUCT: ${frame.productPlacement}`,
      `FRAME ${index + 1} SOUND: ${frame.sfxNotes}`,
    ].join("\n")),
  ].join("\n");
}

export function applyCanonicalStoryboardOverrides(prompt: string, storyboard: OmniStoryboardSegment) {
  const basePrompt = prompt.split(CANONICAL_STORYBOARD_OVERRIDES_HEADER)[0].trimEnd();
  return [basePrompt, renderCanonicalStoryboardOverrides(storyboard)].filter(Boolean).join("\n\n");
}

function normalizeFrame(input: {
  frame: OmniStoryboardFrame;
  productName: string;
  productVisible: boolean;
  productVisibleByFrame?: readonly boolean[];
  frameIndex: number;
  frameCount: number;
  productRole?: ProductRole;
  referenceSceneMode?: ReferenceSceneMode;
}): OmniStoryboardFrame {
  const { frame, productName, productVisible } = input;
  const product = productName.trim() || "продукт";
  const spokenText = frame.spokenText.trim();
  const visibleInFrame = input.productVisibleByFrame?.[input.frameIndex - 1] ?? productVisible;
  const speechMode = visibleInFrame || input.referenceSceneMode === "voiceover_broll"
    ? "voiceover_only"
    : frame.speechMode || frame.physicalPlan?.speechMode;
  const sourceText = `${frame.visualAction} ${frame.productPlacement} ${frame.sfxNotes} ${frame.effectNotes || ""}`;
  const productBroll = visibleInFrame
    ? buildProductBrollAction(product, input.productRole === "digital_demo")
    : null;
  const initialAction = repairReferenceAction({
    action: productBroll || withPassengerContext(frame.visualAction, frame.visualAction),
    spokenText,
    productName: product,
    productVisible: visibleInFrame,
    referenceSupportProps: frame.referenceTransfer?.requiredSupportProps,
  });
  const visualAction = visibleInFrame
    ? initialAction
    : repairReferenceAction({
        action: initialAction,
        spokenText,
        productName: product,
        productVisible: false,
        referenceSupportProps: frame.referenceTransfer?.requiredSupportProps,
      });
  const deliveredVisualAction = speechMode === "voiceover_only"
    ? `${visualAction}; самостоятельная B-roll сцена, речь звучит за кадром`
    : visualAction;
  const productPlacement = visibleInFrame
    ? [
        buildProductBrollPlacement(product, input.productRole === "digital_demo"),
        renderRequiredReferenceSupport(frame.referenceTransfer),
      ].filter(Boolean).join("; ")
    : [
        "в кадре тематические объекты и окружение текущей реплики; продукт вне кадра",
        renderRequiredReferenceSupport(frame.referenceTransfer),
      ].filter(Boolean).join("; ");
  const sfxNotes = spokenText && !CUTAWAY_PATTERN.test(`${visualAction} ${frame.camera}`) && hasConsumptionAction(sourceText)
    ? "тихие естественные звуки комнаты и живой речи"
    : frame.sfxNotes;
  const initialPlan = buildPhysicalFramePlan({
    productName: product,
    spokenText,
    visualAction: deliveredVisualAction,
    camera: visibleInFrame ? buildProductBrollCamera() : frame.camera,
    productPlacement,
    speechMode,
  });
  const repairedAction = repairPhysicalFrameAction({
    productName: product,
    visualAction: deliveredVisualAction,
    plan: initialPlan,
  });
  const canonicalAction = speechMode === "voiceover_only"
    ? sanitizeVoiceoverBrollStoryboardText(repairedAction)
    : repairedAction;
  const physicalPlan = buildPhysicalFramePlan({
    productName: product,
    spokenText,
    visualAction: canonicalAction,
    camera: visibleInFrame ? buildProductBrollCamera() : frame.camera,
    productPlacement,
    speechMode,
  });
  const speechDuringConsumption = Boolean(spokenText) &&
    !CUTAWAY_PATTERN.test(`${repairedAction} ${frame.camera}`) &&
    hasConsumptionAction(sourceText);

  return {
    ...frame,
    visualAction: canonicalAction,
    camera: visibleInFrame ? buildProductBrollCamera() : normalizeVehicleContext(frame.camera),
    environment: normalizeVehicleContext(frame.environment),
    productPlacement,
    sfxNotes,
    effectNotes: speechDuringConsumption ? null : frame.effectNotes,
    speechMode,
    physicalPlan,
    referenceTransfer: synchronizeReferenceTransferProductVisibility(frame.referenceTransfer, visibleInFrame),
  };
}

function withPassengerContext(action: string, sourceAction: string) {
  if (!hasDrivingAction(sourceAction)) return action;
  return action.replace(/^герой\s+/iu, "герой едет пассажиром в движущемся автомобиле; ");
}
