import type { OmniStoryboardFrame } from "../../../omni/storyboard/omni-storyboard-types";
import type { StoryboardFrame } from "../llm-prompt-chain-types";
import {
  buildPhysicalFramePlan,
  hasConsumptionAction,
  hasForeignReferenceProduct,
  hasMultipleHeldObjects,
  repairPhysicalFrameAction,
  repairReferenceAction,
} from "../physical-scene-model";

const EXACT_FABRIC_LOCK =
  "ONE EXACT FABRIC FOR THE WHOLE REEL: preserve the same fiber material, weave, density, surface texture, seams, cut, and fit established in the first frame across every frame and segment";

export function buildStoredStoryboardFrame(input: {
  frame: StoryboardFrame;
  productName: string;
  productPhysicalHint?: string | null;
  productVisible: boolean;
}): OmniStoryboardFrame {
  const spokenText = input.frame.spokenWords;
  const productVisible = input.productVisible && !hasForeignReferenceProduct(spokenText, input.productName);
  const sourceAction = input.frame.visualDescription || input.frame.action;
  const repairedAction = repairReferenceAction({
    action: sourceAction,
    spokenText,
    productName: input.productName,
    productVisible,
  });
  const visualAction = productVisible
    ? repairedAction
    : renderNonProductAction(repairedAction, input.productName);
  const productState = repairProductState({
    state: input.frame.productState,
    productName: input.productName,
    productVisible,
  });
  const productPlacement = productVisible
    ? renderProductPlacement(productState, input.productPhysicalHint)
    : "в кадре только тематические объекты и окружение текущей реплики";
  const sfxNotes = sanitizeSpeechSfx(input.frame.sfx, spokenText);
  const initialPhysicalPlan = buildPhysicalFramePlan({
    productName: input.productName,
    spokenText,
    visualAction,
    camera: input.frame.camera,
    productPlacement,
  });
  const repairedVisualAction = repairPhysicalFrameAction({
    productName: input.productName,
    visualAction,
    plan: initialPhysicalPlan,
  });
  const physicalPlan = repairedVisualAction === visualAction
    ? initialPhysicalPlan
    : buildPhysicalFramePlan({
        productName: input.productName,
        spokenText,
        visualAction: repairedVisualAction,
        camera: input.frame.camera,
        productPlacement,
      });

  return {
    spokenText,
    visualAction: repairedVisualAction,
    camera: input.frame.camera,
    environment: "окружение и свет из режиссерского плана и storyboard image",
    wardrobe: `одежда из avatar или reference contract, без смены между кадрами; ${EXACT_FABRIC_LOCK}`,
    productPlacement,
    sfxNotes,
    effectNotes: null,
    modelMusicNotes: null,
    physicalPlan,
  };
}

function repairProductState(input: {
  state: string;
  productName: string;
  productVisible: boolean;
}) {
  if (!input.productVisible) return "продукт вне кадра в этом кадре";
  const state = input.state.trim() || "продукт следует физическому состоянию storyboard";
  if (hasForeignReferenceProduct(state, input.productName) || hasMultipleHeldObjects(state)) {
    return `${input.productName} в одной руке, без других продуктов и упаковок`;
  }
  return state;
}

function renderProductPlacement(productState: string, productPhysicalHint?: string | null) {
  const hint = productPhysicalHint?.trim();
  return hint ? `${productState}; ${hint}` : `${productState}; продукт физически виден по product reference`;
}

function renderNonProductAction(action: string, productName: string) {
  if (!action.toLocaleLowerCase().includes(productName.toLocaleLowerCase())) return action;
  return "герой спокойно говорит в камеру с нейтральным жестом, без товара в кадре";
}

function sanitizeSpeechSfx(sfx: string | null, spokenText: string) {
  if (sfx && spokenText.trim() && hasConsumptionAction(sfx)) {
    return "естественный звук речи и комнаты";
  }
  return sfx || "естественные звуки речи и движения продукта";
}
