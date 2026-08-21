import type { OmniStoryboardFrame } from "../../../omni/storyboard/omni-storyboard-types";
import type { StoryboardFrame } from "../llm-prompt-chain-types";
import type { DirectorSegmentProfile } from "../director-analysis-types";
import {
  buildPhysicalProductDemoStep,
  buildPhysicalFramePlan,
  hasConsumptionAction,
  hasForeignReferenceProduct,
  hasMultipleHeldObjects,
  repairPhysicalFrameAction,
  repairReferenceAction,
} from "../physical-scene-model";
import {
  buildReferenceTransferFramePlan,
  renderRequiredReferenceSupport,
  resolveReferenceTransferAction,
  resolveReferenceTransferPolicy,
  type ReferenceTransferPolicy,
} from "../omni-reference-transfer-policy";
import { isVoiceoverMontageReference, type ReferenceFormatMode } from "../omni-reference-format-mode";

const EXACT_FABRIC_LOCK =
  "ONE EXACT FABRIC FOR THE WHOLE REEL: preserve the same fiber material, weave, density, surface texture, seams, cut, and fit established in the first frame across every frame and segment";

export function buildStoredStoryboardFrame(input: {
  frame: StoryboardFrame;
  productName: string;
  productPhysicalHint?: string | null;
  productVisible: boolean;
  productDemoFrame?: { frameIndex: number; frameCount: number };
  referenceProfile?: DirectorSegmentProfile | null;
  referenceTransferPolicy?: ReferenceTransferPolicy;
  referenceFormatMode?: ReferenceFormatMode;
}): OmniStoryboardFrame {
  const spokenText = input.frame.spokenWords;
  const productVisible = input.productVisible;
  const sourceAction = input.frame.visualDescription || input.frame.action;
  const referenceAction = [
    input.referenceProfile?.action_description,
    input.referenceProfile?.actor_gesture,
  ].filter(Boolean).join("; ");
  const referenceTransfer = buildReferenceTransferFramePlan({
    policy: resolveReferenceTransferPolicy(input.referenceTransferPolicy),
    spokenText,
    visualCue: sourceAction,
    productName: input.productName,
    productVisible,
  });
  const repairedAction = repairReferenceAction({
    action: resolveReferenceTransferAction({
      framePlan: referenceTransfer,
      referenceAction,
      fallbackAction: sourceAction,
    }),
    spokenText,
    productName: input.productName,
    productVisible,
    referenceSupportProps: referenceTransfer.requiredSupportProps,
  });
  const productDemo = productVisible && input.productDemoFrame
    ? buildPhysicalProductDemoStep({ productName: input.productName, ...input.productDemoFrame })
    : null;
  const visualAction = productDemo
    ? productDemo.action
    : productVisible
      ? repairedAction
    : renderNonProductAction(repairedAction, input.productName);
  const productState = repairProductState({
    state: input.frame.productState,
    productName: input.productName,
    productVisible,
  });
  const productPlacement = productVisible
    ? renderProductPlacement(productDemo?.placement || productState, input.productPhysicalHint, referenceTransfer)
    : ["в кадре тематические объекты и окружение текущей реплики", renderRequiredReferenceSupport(referenceTransfer)]
      .filter(Boolean)
      .join("; ");
  const camera = renderReferenceCamera(input.frame.camera, input.referenceProfile);
  const environment = renderReferenceEnvironment(input.referenceProfile);
  const sfxNotes = sanitizeSpeechSfx(input.frame.sfx, spokenText);
  const initialPhysicalPlan = buildPhysicalFramePlan({
    productName: input.productName,
    spokenText,
    visualAction,
    camera,
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
        camera,
        productPlacement,
      });

  const wardrobe = isVoiceoverMontageReference(input.referenceFormatMode)
    ? "одежда соответствует текущему независимому reference-кадру; лицо, волосы, возраст и телосложение героя сохраняются между сегментами"
    : `одежда из avatar или reference contract, без смены между кадрами; ${EXACT_FABRIC_LOCK}`;

  return {
    spokenText,
    visualAction: repairedVisualAction,
    camera,
    environment,
    wardrobe,
    productPlacement,
    sfxNotes,
    effectNotes: null,
    modelMusicNotes: null,
    physicalPlan,
    referenceTransfer,
  };
}

function renderReferenceCamera(camera: string, profile?: DirectorSegmentProfile | null) {
  if (!profile) return camera;
  return [
    "reference camera lock",
    profile.camera.shot_types.join(", "),
    profile.camera.angles.length ? `angles ${profile.camera.angles.join(", ")}` : "",
    profile.camera.movements.length ? `movement ${profile.camera.movements.join(", ")}` : "",
    profile.camera.stabilization,
    camera,
  ].filter(Boolean).join("; ");
}

function renderReferenceEnvironment(profile?: DirectorSegmentProfile | null) {
  if (!profile) return "окружение и свет из режиссерского плана и storyboard image";
  return [profile.setting, profile.environment, profile.lighting]
    .filter(Boolean)
    .join("; ") || "окружение и свет из режиссерского плана и storyboard image";
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

function renderProductPlacement(
  productState: string,
  productPhysicalHint: string | null | undefined,
  referenceTransfer: ReturnType<typeof buildReferenceTransferFramePlan>
) {
  const hint = productPhysicalHint?.trim();
  const support = renderRequiredReferenceSupport(referenceTransfer);
  return [productState, hint || "продукт физически виден по product reference", support].filter(Boolean).join("; ");
}

function renderNonProductAction(action: string, productName: string) {
  if (!action.toLocaleLowerCase().includes(productName.toLocaleLowerCase()) && !/(?:\bproduct\b|продукт|товар|упаков)/iu.test(action)) return action;
  return "герой спокойно говорит в камеру с нейтральным жестом, без товара в кадре";
}

function sanitizeSpeechSfx(sfx: string | null, spokenText: string) {
  if (sfx && spokenText.trim() && hasConsumptionAction(sfx)) {
    return "естественный звук речи и комнаты";
  }
  return sfx || "естественные звуки речи и движения продукта";
}
