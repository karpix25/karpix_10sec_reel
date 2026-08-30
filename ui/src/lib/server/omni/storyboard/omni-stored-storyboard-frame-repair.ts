import type { OmniStoryboardFrame } from "../../../omni/storyboard/omni-storyboard-types";
import type { ProductRole } from "../../../omni/creative-contract";
import type { StoryboardFrame } from "../llm-prompt-chain-types";
import type { DirectorBrief, DirectorSegmentProfile } from "../director-analysis-types";
import {
  buildPhysicalFramePlan,
  hasConsumptionAction,
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
import type { ReferenceFormatMode } from "../omni-reference-format-mode";
import { sanitizeVoiceoverBrollStoryboardText } from "./omni-storyboard-text-sanitizer";
import type { ReferenceSceneMode } from "../omni-reference-scene-mode";
import { resolveDirectorVisibleSubjectPolicy } from "../director-visibility-policy";
import {
  buildProductBrollAction,
  buildProductBrollCamera,
  buildProductBrollPlacement,
  OMNI_PRODUCT_BROLL_WARDROBE,
} from "../omni-product-broll-contract";
import { renderReferenceWardrobe } from "./omni-storyboard-frame-rendering";

export function buildStoredStoryboardFrame(input: {
  frame: StoryboardFrame;
  productName: string;
  productPhysicalHint?: string | null;
  productVisible: boolean;
  productRole?: ProductRole;
  referenceProfile?: DirectorSegmentProfile | null;
  directorBrief?: DirectorBrief | null;
  referenceTransferPolicy?: ReferenceTransferPolicy;
  referenceFormatMode?: ReferenceFormatMode;
  referenceSceneMode?: ReferenceSceneMode;
}): OmniStoryboardFrame {
  const spokenText = input.frame.spokenWords;
  const productVisible = input.productVisible;
  const noPeopleReference = resolveDirectorVisibleSubjectPolicy(input.directorBrief) === "no_people";
  const speechMode = productVisible || noPeopleReference || input.referenceSceneMode === "voiceover_broll" || input.referenceProfile?.avatar_allowed === false
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
  const visualAction = productVisible
    ? buildProductBrollAction(input.productName, input.productRole === "digital_demo")
    : renderNonProductAction(repairedAction, input.productName, noPeopleReference);
  const deliveryVisualAction = speechMode === "voiceover_only"
    ? `${visualAction}; самостоятельная B-roll сцена, речь звучит за кадром`
    : visualAction;
  const productPlacement = productVisible
    ? [
        buildProductBrollPlacement(input.productName, input.productRole === "digital_demo"),
        input.productPhysicalHint,
        renderRequiredReferenceSupport(referenceTransfer),
      ].filter(Boolean).join("; ")
    : ["в кадре тематические объекты и окружение текущей реплики", renderRequiredReferenceSupport(referenceTransfer)]
      .filter(Boolean)
      .join("; ");
  const camera = productVisible
    ? buildProductBrollCamera()
    : noPeopleReference
    ? "самостоятельный атмосферный B-roll ракурс по текущей реплике, без людей и рук"
    : renderReferenceCamera(input.frame.camera, input.referenceProfile, referenceTransfer.cameraComposition);
  const environment = renderReferenceEnvironment(input.referenceProfile, input.referenceTransferPolicy);
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

  const wardrobe = productVisible ? OMNI_PRODUCT_BROLL_WARDROBE : renderReferenceWardrobe({
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

function renderReferenceEnvironment(
  profile?: DirectorSegmentProfile | null,
  referencePolicy?: ReferenceTransferPolicy,
) {
  if (!profile) return "окружение и свет из режиссерского плана и storyboard image";
  if (referencePolicy?.mode === "full_reference") {
    return [
      `SOURCE LOCATION: ${profile.setting || "verified source setting"}`,
      `environment: ${profile.environment || "verified source environment"}`,
      `light: ${profile.lighting || "verified source lighting"}`,
      "preserve this source location, environment, and light for the interval",
    ].join("; ");
  }
  return ["LIGHT AND MOOD INSPIRATION", profile.lighting, "choose a new script-relevant location"]
    .filter(Boolean)
    .join("; ") || "окружение и свет из режиссерского плана и storyboard image";
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
