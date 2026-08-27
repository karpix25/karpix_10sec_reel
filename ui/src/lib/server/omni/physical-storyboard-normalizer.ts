import type { OmniStoryboardFrame, OmniStoryboardSegment } from "../../omni/storyboard/omni-storyboard-types";
import type { ProductRole } from "../../omni/creative-contract";
import {
  buildPhysicalProductDemoStep,
  buildPhysicalFramePlan,
  hasConsumptionAction,
  hasDrivingAction,
  hasForeignReferenceProduct,
  hasMultipleHeldObjects,
  normalizeVehicleContext,
  repairPhysicalFrameAction,
  repairReferenceAction,
} from "./physical-scene-model";
import {
  renderRequiredReferenceSupport,
  synchronizeReferenceTransferProductVisibility,
} from "./omni-reference-transfer-policy";
import { buildDigitalProductDemoStep } from "./digital-product-scene";
import { sanitizeVoiceoverBrollStoryboardText } from "./storyboard/omni-storyboard-text-sanitizer";
import type { ReferenceSceneMode } from "./omni-reference-scene-mode";

const SURFACE_PATTERN = /(?:на столе|на\s+(?:\p{L}+\s+){0,3}поверхности|на полке|лежит|стоит|on (?:the )?(?:table|surface|shelf)|resting on)/iu;
const HELD_PRODUCT_PATTERN = /(?:держит|держать|в руках|holding|holds|in one hand|(?<!\p{L})одной рукой|в одну руку|в одной руке)/iu;
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
  const speechMode = input.referenceSceneMode === "voiceover_broll"
    ? "voiceover_only"
    : frame.speechMode || frame.physicalPlan?.speechMode;
  const sourceText = `${frame.visualAction} ${frame.productPlacement} ${frame.sfxNotes} ${frame.effectNotes || ""}`;
  const visibleInFrame = input.productVisibleByFrame?.[input.frameIndex - 1] ?? productVisible;
  const productDemo = visibleInFrame && (input.productRole === undefined || input.productRole === "brief_demo") && input.frameCount > 1
    ? buildPhysicalProductDemoStep({
        productName: product,
        frameIndex: input.frameIndex,
        frameCount: input.frameCount,
      })
    : null;
  const digitalProductDemo = visibleInFrame && input.productRole === "digital_demo"
    ? buildDigitalProductDemoStep({
        productName: product,
        frameIndex: input.frameIndex,
        frameCount: input.frameCount,
      })
    : null;
  const demo = productDemo || digitalProductDemo;
  const initialAction = repairReferenceAction({
    action: withPassengerContext(demo?.action || frame.visualAction, frame.visualAction),
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
  const productPlacement = demo
    ? [demo.placement, renderRequiredReferenceSupport(frame.referenceTransfer)].filter(Boolean).join("; ")
    : visibleInFrame
    ? renderSafeProductPlacement(product, frame.productPlacement, frame.referenceTransfer)
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
    camera: frame.camera,
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
    camera: frame.camera,
    productPlacement,
    speechMode,
  });
  const speechDuringConsumption = Boolean(spokenText) &&
    !CUTAWAY_PATTERN.test(`${repairedAction} ${frame.camera}`) &&
    hasConsumptionAction(sourceText);

  return {
    ...frame,
    visualAction: canonicalAction,
    camera: normalizeVehicleContext(frame.camera),
    environment: normalizeVehicleContext(frame.environment),
    productPlacement,
    sfxNotes,
    effectNotes: speechDuringConsumption ? null : frame.effectNotes,
    speechMode,
    physicalPlan,
    referenceTransfer: synchronizeReferenceTransferProductVisibility(frame.referenceTransfer, visibleInFrame),
  };
}

function renderSafeProductPlacement(
  product: string,
  sourcePlacement: string,
  referenceTransfer: OmniStoryboardFrame["referenceTransfer"]
) {
  const support = renderRequiredReferenceSupport(referenceTransfer);
  if (SURFACE_PATTERN.test(sourcePlacement) && !hasForeignReferenceProduct(sourcePlacement, product)) {
    return `${product} стоит на одной поверхности; без других брендовых продуктов и упаковок; ${support}`;
  }
  if (hasForeignReferenceProduct(sourcePlacement, product) || hasMultipleHeldObjects(sourcePlacement)) {
    return `${product} в одной руке, упаковка повернута лицевой стороной к камере; без других брендовых продуктов и упаковок; ${support}`;
  }
  if (HELD_PRODUCT_PATTERN.test(sourcePlacement)) return [sourcePlacement.trim(), support].filter(Boolean).join("; ");
  return `${product} в одной руке, упаковка повернута лицевой стороной к камере; ${support}`;
}

function withPassengerContext(action: string, sourceAction: string) {
  if (!hasDrivingAction(sourceAction)) return action;
  return action.replace(/^герой\s+/iu, "герой едет пассажиром в движущемся автомобиле; ");
}
