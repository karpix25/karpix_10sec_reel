import type { OmniStoryboardFrame } from "../../../omni/storyboard/omni-storyboard-types";
import type { ProductRole } from "../../../omni/creative-contract";
import type { StoryboardFrame } from "../llm-prompt-chain-types";
import type { DirectorBrief, DirectorSegmentProfile } from "../director-analysis-types";
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
import { buildDigitalProductDemoStep } from "../digital-product-scene";
import type { ReferenceFormatMode } from "../omni-reference-format-mode";
import { sanitizeVoiceoverBrollStoryboardText } from "./omni-storyboard-text-sanitizer";
import type { ReferenceSceneMode } from "../omni-reference-scene-mode";
import { resolveDirectorVisibleSubjectPolicy } from "../director-visibility-policy";
import { renderReferenceWardrobe } from "./omni-storyboard-frame-rendering";

export function buildStoredStoryboardFrame(input: {
  frame: StoryboardFrame;
  productName: string;
  productPhysicalHint?: string | null;
  productVisible: boolean;
  productRole?: ProductRole;
  productDemoFrame?: { frameIndex: number; frameCount: number };
  referenceProfile?: DirectorSegmentProfile | null;
  directorBrief?: DirectorBrief | null;
  referenceTransferPolicy?: ReferenceTransferPolicy;
  referenceFormatMode?: ReferenceFormatMode;
  referenceSceneMode?: ReferenceSceneMode;
}): OmniStoryboardFrame {
  const spokenText = input.frame.spokenWords;
  const productVisible = input.productVisible;
  const noPeopleReference = resolveDirectorVisibleSubjectPolicy(input.directorBrief) === "no_people";
  const speechMode = noPeopleReference || input.referenceSceneMode === "voiceover_broll" || input.referenceProfile?.avatar_allowed === false
    ? "voiceover_only"
    : input.referenceProfile?.speech_mode || "on_camera";
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
  const productDemo = productVisible && !noPeopleReference && input.productRole === "brief_demo" && input.productDemoFrame
    ? buildPhysicalProductDemoStep({ productName: input.productName, ...input.productDemoFrame })
    : null;
  const digitalProductDemo = productVisible && input.productRole === "digital_demo" && input.productDemoFrame
    ? buildDigitalProductDemoStep({ productName: input.productName, ...input.productDemoFrame, noPeopleReference })
    : null;
  const demo = productDemo || digitalProductDemo;
  const visualAction = demo
    ? demo.action
    : productVisible
      ? noPeopleReference
        ? `утвержденный продукт ${input.productName} находится в самостоятельной B-roll композиции без людей и рук`
        : repairedAction
    : renderNonProductAction(repairedAction, input.productName, noPeopleReference);
  const deliveryVisualAction = speechMode === "voiceover_only"
    ? `${visualAction}; самостоятельная B-roll сцена, речь звучит за кадром`
    : visualAction;
  const productState = repairProductState({
    state: input.frame.productState,
    productName: input.productName,
    productVisible,
  });
  const productPlacement = productVisible
    ? renderProductPlacement(demo?.placement || productState, input.productPhysicalHint, referenceTransfer, input.productRole)
    : ["в кадре тематические объекты и окружение текущей реплики", renderRequiredReferenceSupport(referenceTransfer)]
      .filter(Boolean)
      .join("; ");
  const camera = noPeopleReference
    ? "самостоятельный атмосферный B-roll ракурс по текущей реплике, без людей и рук"
    : renderReferenceCamera(input.frame.camera, input.referenceProfile, referenceTransfer.cameraComposition);
  const environment = renderReferenceEnvironment(input.referenceProfile);
  const sfxNotes = sanitizeSpeechSfx(input.frame.sfx, spokenText);
  const initialPhysicalPlan = buildPhysicalFramePlan({
    productName: input.productName,
    spokenText,
    visualAction: deliveryVisualAction,
    camera,
    productPlacement,
    speechMode,
  });
  const repairedVisualAction = repairPhysicalFrameAction({
    productName: input.productName,
    visualAction: deliveryVisualAction,
    plan: initialPhysicalPlan,
  });
  const canonicalVisualAction = speechMode === "voiceover_only"
    ? sanitizeVoiceoverBrollStoryboardText(repairedVisualAction)
    : repairedVisualAction;
  const physicalPlan = canonicalVisualAction === deliveryVisualAction
    ? initialPhysicalPlan
    : buildPhysicalFramePlan({
        productName: input.productName,
        spokenText,
        visualAction: canonicalVisualAction,
        camera,
        productPlacement,
        speechMode,
      });

  const wardrobe = renderReferenceWardrobe({
    brief: input.directorBrief,
    referenceProfile: input.referenceProfile,
    referenceFormatMode: input.referenceFormatMode,
    referenceSceneMode: input.referenceSceneMode,
  });

  return {
    spokenText,
    visualAction: canonicalVisualAction,
    camera,
    environment,
    wardrobe,
    productPlacement,
    sfxNotes,
    effectNotes: null,
    modelMusicNotes: null,
    speechMode,
    physicalPlan,
    referenceTransfer,
  };
}

function renderReferenceCamera(
  camera: string,
  profile?: DirectorSegmentProfile | null,
  cameraComposition?: string | null,
) {
  const composition = cameraComposition ? `КОМПОЗИЦИЯ REFERENCE: ${cameraComposition}` : "";
  if (!profile) return [camera, composition].filter(Boolean).join("; ");
  return [
    "camera inspiration",
    profile.camera.shot_types.join(", "),
    profile.camera.angles.length ? `angles ${profile.camera.angles.join(", ")}` : "",
    profile.camera.movements.length ? `movement ${profile.camera.movements.join(", ")}` : "",
    profile.camera.stabilization,
    composition,
    camera,
    "choose the clearest angle for the current storyboard beat",
  ].filter(Boolean).join("; ");
}

function renderReferenceEnvironment(profile?: DirectorSegmentProfile | null) {
  if (!profile) return "окружение и свет из режиссерского плана и storyboard image";
  return ["LIGHT AND MOOD INSPIRATION", profile.lighting, "choose a new script-relevant location"]
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
  referenceTransfer: ReturnType<typeof buildReferenceTransferFramePlan>,
  productRole?: ProductRole
) {
  const hint = productPhysicalHint?.trim();
  const support = renderRequiredReferenceSupport(referenceTransfer);
  return [productState, productRole === "digital_demo"
    ? "утвержденный экран продукта на смартфоне; не пластиковая карта и не упаковка"
    : hint || "продукт физически виден по product reference", support].filter(Boolean).join("; ");
}

function renderNonProductAction(action: string, productName: string, noPeopleReference = false) {
  if (noPeopleReference) return "самостоятельный атмосферный B-roll по текущей реплике, без товара, людей и рук";
  if (!action.toLocaleLowerCase().includes(productName.toLocaleLowerCase()) && !/(?:\bproduct\b|продукт|товар|упаков)/iu.test(action)) return action;
  return "герой спокойно говорит в камеру с нейтральным жестом, без товара в кадре";
}

function sanitizeSpeechSfx(sfx: string | null, spokenText: string) {
  if (sfx && spokenText.trim() && hasConsumptionAction(sfx)) {
    return "естественный звук речи и комнаты";
  }
  return sfx || "естественные звуки речи и движения продукта";
}
