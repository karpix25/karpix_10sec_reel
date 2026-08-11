import type { OmniStoryboardFrame, OmniStoryboardSegment } from "../../omni/storyboard/omni-storyboard-types";
import {
  buildPhysicalFramePlan,
  hasConsumptionAction,
  hasForeignReferenceProduct,
  hasMultipleHeldObjects,
  normalizeVehicleContext,
  repairPhysicalFrameAction,
  repairReferenceAction,
} from "./physical-scene-model";
import { isOmniProductVisualBeat } from "./omni-intro-product-contract";
import { synchronizeReferenceTransferProductVisibility } from "./omni-reference-transfer-policy";

const HIDDEN_PRODUCT_PATTERN = /(?:вне кадра|не виден|скрыт|hidden|off\s*camera|только тематические объекты)/iu;
const SURFACE_PATTERN = /(?:на столе|на поверхности|на полке|лежит|стоит|on (?:the )?(?:table|surface|shelf)|resting on)/iu;
const HELD_PRODUCT_PATTERN = /(?:держит|держать|в руках|holding|holds|in one hand|одной рукой|в одну руку|в одной руке)/iu;
const CUTAWAY_PATTERN = /cutaway|insert|macro|product close|крупн(?:ый|ом) кадр|перебив|предметн(?:ый|ая) кадр/iu;

/**
 * Applies the cheap, deterministic physical fixes before any model call.
 * The AI repair layer handles novel wording; known contradictions must not
 * spend a paid request or reach the provider.
 */
export function normalizePhysicalStoryboardSegment(input: {
  storyboard: OmniStoryboardSegment;
  productName: string;
}): OmniStoryboardSegment {
  return {
    ...input.storyboard,
    frames: input.storyboard.frames.map((frame) => normalizeFrame(frame, input.productName)),
  };
}

export function renderCanonicalStoryboardOverrides(storyboard: OmniStoryboardSegment) {
  return [
    "FINAL CANONICAL STORYBOARD OVERRIDES: these per-frame physical actions are authoritative; ignore conflicting earlier action wording.",
    ...storyboard.frames.map((frame, index) => [
      `FRAME ${index + 1} ACTION: ${frame.visualAction}`,
      `FRAME ${index + 1} PRODUCT: ${frame.productPlacement}`,
      `FRAME ${index + 1} SOUND: ${frame.sfxNotes}`,
    ].join("\n")),
  ].join("\n");
}

function normalizeFrame(frame: OmniStoryboardFrame, productName: string): OmniStoryboardFrame {
  const product = productName.trim() || "продукт";
  const spokenText = frame.spokenText.trim();
  const sourceText = `${frame.visualAction} ${frame.productPlacement} ${frame.sfxNotes} ${frame.effectNotes || ""}`;
  const productVisible = !HIDDEN_PRODUCT_PATTERN.test(frame.productPlacement) &&
    isOmniProductVisualBeat(spokenText, product) &&
    !hasForeignReferenceProduct(spokenText, product);
  const initialAction = repairReferenceAction({
    action: frame.visualAction,
    spokenText,
    productName: product,
    productVisible,
  });
  const visualAction = productVisible
    ? initialAction
    : repairReferenceAction({
        action: initialAction,
        spokenText,
        productName: product,
        productVisible: false,
      });
  const productPlacement = productVisible
    ? renderSafeProductPlacement(product, frame.productPlacement)
    : "в кадре только тематические объекты и окружение текущей реплики; продукт вне кадра";
  const sfxNotes = spokenText && !CUTAWAY_PATTERN.test(`${visualAction} ${frame.camera}`) && hasConsumptionAction(sourceText)
    ? "тихие естественные звуки комнаты и живой речи"
    : frame.sfxNotes;
  const initialPlan = buildPhysicalFramePlan({
    productName: product,
    spokenText,
    visualAction,
    camera: frame.camera,
    productPlacement,
  });
  const repairedAction = repairPhysicalFrameAction({
    productName: product,
    visualAction,
    plan: initialPlan,
  });
  const physicalPlan = buildPhysicalFramePlan({
    productName: product,
    spokenText,
    visualAction: repairedAction,
    camera: frame.camera,
    productPlacement,
  });
  const speechDuringConsumption = Boolean(spokenText) &&
    !CUTAWAY_PATTERN.test(`${repairedAction} ${frame.camera}`) &&
    hasConsumptionAction(sourceText);

  return {
    ...frame,
    visualAction: repairedAction,
    camera: normalizeVehicleContext(frame.camera),
    environment: normalizeVehicleContext(frame.environment),
    productPlacement,
    sfxNotes,
    effectNotes: speechDuringConsumption ? null : frame.effectNotes,
    physicalPlan,
    referenceTransfer: synchronizeReferenceTransferProductVisibility(frame.referenceTransfer, productVisible),
  };
}

function renderSafeProductPlacement(product: string, sourcePlacement: string) {
  if (SURFACE_PATTERN.test(sourcePlacement) && !hasForeignReferenceProduct(sourcePlacement, product)) {
    return `${product} стоит на одной поверхности; без других продуктов и упаковок`;
  }
  if (hasForeignReferenceProduct(sourcePlacement, product) || hasMultipleHeldObjects(sourcePlacement)) {
    return `${product} в одной руке, упаковка повернута лицевой стороной к камере; без других продуктов и упаковок`;
  }
  if (HELD_PRODUCT_PATTERN.test(sourcePlacement)) return sourcePlacement.trim();
  return `${product} в одной руке, упаковка повернута лицевой стороной к камере`;
}
