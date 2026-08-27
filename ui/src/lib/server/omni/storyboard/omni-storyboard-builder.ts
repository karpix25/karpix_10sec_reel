import type { OmniPromptValidationResult, OmniSegmentCreativePlan, ProductRole } from "../../../omni/creative-contract";
import {
  getOmniStoryboardFrameWordCounts,
  getOmniStoryboardFrameCount,
  type OmniStoryboardFrame,
  type OmniStoryboardSegment,
  type OmniStoryboardValidationResult,
} from "../../../omni/storyboard/omni-storyboard-types";
import { validateOmniStoryboardSegment } from "../../../omni/storyboard/omni-storyboard-contract";
import type { OmniCharacterContract } from "../omni-character-contract";
import type { StoryboardFrame } from "../llm-prompt-chain-types";
import {
  selectDirectorSegmentProfile,
  type DirectorBrief,
  type DirectorSegmentProfile,
} from "../director-analysis-types";
import type { OmniWardrobeSource } from "../../../omni/wardrobe-source";
import { mentionsOmniProduct } from "../omni-intro-product-contract";
import { renderFrameTransitionNote } from "./omni-storyboard-effects";
import {
  buildPhysicalProductDemoStep,
  buildPhysicalFramePlan,
  normalizeVehicleContext,
  repairReferenceAction,
  repairPhysicalFrameAction,
  resolveProductDemoFrame,
} from "../physical-scene-model";
import { splitStoryboardSpeech } from "./omni-storyboard-speech";
import { renderStoryboardProductPlacement } from "./omni-storyboard-product-placement";
import { buildDigitalProductDemoStep } from "../digital-product-scene";
import { buildStoredStoryboardFrame } from "./omni-stored-storyboard-frame-repair";
import {
  buildReferenceTransferFramePlan,
  renderRequiredReferenceSupport,
  resolveReferenceTransferPolicy,
  resolveReferenceTransferAction,
  type ReferenceTransferPolicy,
} from "../omni-reference-transfer-policy";
import { isFacelessReferenceScene, isObjectOnlyReferenceScene, type ReferenceSceneMode } from "../omni-reference-scene-mode";
import { resolveReferenceFormatMode, type ReferenceFormatMode } from "../omni-reference-format-mode";
import { sanitizeFacelessStoryboardText, sanitizeVoiceoverBrollStoryboardText } from "./omni-storyboard-text-sanitizer";
import {
  renderStoryboardFrameCamera,
  renderStoryboardWardrobe,
} from "./omni-storyboard-frame-rendering";
import { resolveDirectorVisibleSubjectPolicy } from "../director-visibility-policy";

export function buildStoryboardFromCreativePlan(input: {
  plan: OmniSegmentCreativePlan;
  productName: string;
  productVisualPassport?: string | null;
  productPhysicalHint?: string | null;
  characterContract: OmniCharacterContract;
  segmentIndex: number;
  segmentCount?: number;
  durationSeconds: number;
  directorBrief?: DirectorBrief | null;
  wardrobeSource?: OmniWardrobeSource;
  referenceTransferPolicy?: ReferenceTransferPolicy;
  referenceSceneMode?: ReferenceSceneMode;
}): OmniStoryboardSegment {
  const frameCount = getOmniStoryboardFrameCount(input.durationSeconds);
  if (!frameCount) throw new Error(`Storyboard segment ${input.segmentIndex} has unsupported duration ${input.durationSeconds}`);
  const words = input.plan.voiceoverText.trim().split(/\s+/u).filter(Boolean);
  if (!getOmniStoryboardFrameWordCounts(words.length, input.durationSeconds)) {
    throw new Error(`Storyboard segment ${input.segmentIndex} word count does not match the supported frame distribution`);
  }

  const chunks = splitStoryboardSpeech(input.plan.voiceoverText, frameCount);
  return {
    segmentIndex: input.segmentIndex,
    durationSeconds: input.durationSeconds,
    voiceoverText: input.plan.voiceoverText,
    frames: chunks.map((spokenText, index) =>
      buildFrame({
        plan: input.plan,
        productName: input.productName,
        productVisualPassport: input.productVisualPassport,
        productPhysicalHint: input.productPhysicalHint,
        characterContract: input.characterContract,
        directorBrief: input.directorBrief,
        wardrobeSource: input.wardrobeSource,
        referenceTransferPolicy: input.referenceTransferPolicy,
        referenceSceneMode: input.referenceSceneMode,
        referenceFormatMode: resolveReferenceFormatMode(input.directorBrief),
        segmentIndex: input.segmentIndex,
        segmentCount: input.segmentCount || 1,
        spokenText,
        frameIndex: index + 1,
        frameCount,
      })
    ),
  };
}

export function buildStoryboardFromPromptChainFrames(input: {
  segmentIndex: number;
  durationSeconds: number;
  voiceoverText: string;
  productName: string;
  frames: readonly StoryboardFrame[];
  productPhysicalHint?: string | null;
  directorBrief?: DirectorBrief | null;
  segmentCount?: number;
  productVisible?: boolean | readonly boolean[];
  productRole?: ProductRole;
  referenceTransferPolicy?: ReferenceTransferPolicy;
  referenceSceneMode?: ReferenceSceneMode;
}): OmniStoryboardSegment {
  if (!input.frames.length) throw new Error(`Storyboard segment ${input.segmentIndex} has no frames`);
  const speechChunks = splitStoryboardSpeech(input.voiceoverText, input.frames.length);
  if (speechChunks.length !== input.frames.length || input.frames.some((frame, index) => frame.spokenWords !== speechChunks[index])) throw new Error(`Storyboard segment ${input.segmentIndex} spoken words do not match the canonical frame distribution`);
  return {
    segmentIndex: input.segmentIndex,
    durationSeconds: input.durationSeconds,
    voiceoverText: input.voiceoverText,
    frames: input.frames.map((frame, index) => {
      const productVisible = Array.isArray(input.productVisible) ? Boolean(input.productVisible[index]) : Boolean(input.productVisible);
      const referenceProfile = selectDirectorSegmentProfile({
        brief: input.directorBrief,
        segmentIndex: input.segmentIndex,
        segmentCount: input.segmentCount || 1,
        frameIndex: index + 1,
        frameCount: input.frames.length,
      });
      const storedFrame = buildStoredStoryboardFrame({
        frame,
        productName: input.productName,
        productPhysicalHint: input.productPhysicalHint,
        productVisible,
        productRole: input.productRole,
        productDemoFrame: productVisible ? resolveProductDemoFrame(input.productVisible, index, input.frames.length) || undefined : undefined,
        referenceProfile,
        directorBrief: input.directorBrief,
        referenceTransferPolicy: input.referenceTransferPolicy,
        referenceFormatMode: resolveReferenceFormatMode(input.directorBrief),
        referenceSceneMode: input.referenceSceneMode,
      });
      return isFacelessReferenceScene(input.referenceSceneMode)
        ? {
            ...storedFrame,
            visualAction: sanitizeFacelessStoryboardText(storedFrame.visualAction, input.referenceSceneMode),
            camera: sanitizeFacelessStoryboardText(storedFrame.camera, input.referenceSceneMode),
          }
        : storedFrame;
    }),
  };
}

export function promptValidationFromStoryboard(
  validation: OmniStoryboardValidationResult
): OmniPromptValidationResult {
  return {
    valid: validation.valid,
    score: Math.max(0, 100 - validation.errors.length * 25 - validation.warnings.length * 6),
    errors: validation.errors,
    warnings: validation.warnings,
  };
}

export function validateBuiltStoryboard(storyboard: OmniStoryboardSegment) {
  return validateOmniStoryboardSegment(storyboard);
}

function buildFrame(input: {
  plan: OmniSegmentCreativePlan;
  productName: string;
  productVisualPassport?: string | null;
  productPhysicalHint?: string | null;
  characterContract: OmniCharacterContract;
  directorBrief?: DirectorBrief | null;
  wardrobeSource?: OmniWardrobeSource;
  referenceTransferPolicy?: ReferenceTransferPolicy;
  segmentIndex: number;
  segmentCount?: number;
  spokenText: string;
  frameIndex: number;
  frameCount: number;
  referenceSceneMode?: ReferenceSceneMode;
  referenceFormatMode?: ReferenceFormatMode;
}): OmniStoryboardFrame {
  const referenceProfile = selectDirectorSegmentProfile({
    brief: input.directorBrief,
    segmentIndex: input.segmentIndex,
    segmentCount: input.segmentCount || 1,
    frameIndex: input.frameIndex,
    frameCount: input.frameCount,
  });
  const facelessReferenceScene = isFacelessReferenceScene(input.referenceSceneMode);
  const voiceoverBrollReference = input.referenceSceneMode === "voiceover_broll" || referenceProfile?.avatar_allowed === false;
  const noPeopleReference = resolveDirectorVisibleSubjectPolicy(input.directorBrief) === "no_people" ||
    referenceProfile?.visible_subject_role === "no_people";
  const objectOnlyReferenceScene = isObjectOnlyReferenceScene(input.referenceSceneMode);
  const startSeconds = (input.frameIndex - 1) * 2;
  const beat = input.plan.beats.find((item) => startSeconds >= item.startSeconds && startSeconds < item.endSeconds) ||
    input.plan.beats[0];
  const layoutLocked = !noPeopleReference && /REFERENCE LAYOUT|collage\/PIP/iu.test(beat?.action || "");
  const productVisible = input.plan.productVisibleByFrame?.[input.frameIndex - 1] ?? input.plan.productRole !== "hidden";
  const demoFrame = productVisible ? resolveProductDemoFrame(input.plan.productVisibleByFrame, input.frameIndex - 1, input.frameCount) : null;
  const speechMode = noPeopleReference ? "voiceover_only" : referenceProfile?.speech_mode || "on_camera";
  const referencePolicy = resolveReferenceTransferPolicy(input.referenceTransferPolicy);
  const referenceAction = layoutLocked || referencePolicy.mode === "style_only"
    ? ""
    : renderProfileAction(referenceProfile);
  const fallbackAction = normalizeDefaultFrameAction(beat?.action, noPeopleReference);
  const referenceTransfer = buildReferenceTransferFramePlan({
    policy: referencePolicy,
    spokenText: input.spokenText,
    visualCue: extractVisualCue(fallbackAction),
    productName: input.productName,
    productVisible,
    position: ((input.segmentIndex - 1) * input.frameCount + input.frameIndex - 0.5) /
      Math.max(1, (input.segmentCount || 1) * input.frameCount),
  });
  const visualActionSource = layoutLocked
    ? beat?.action || ""
    : repairReferenceAction({
        action: resolveReferenceTransferAction({
          framePlan: referenceTransfer,
          referenceAction,
          fallbackAction,
        }),
        spokenText: input.spokenText,
        productName: input.productName,
        productVisible,
        referenceSupportProps: referenceTransfer.requiredSupportProps,
      });
  const isCutawayFrame = Boolean(referenceAction && isReferenceCutawayAction(referenceAction));
  const productDemo = productVisible && !noPeopleReference && input.plan.productRole === "brief_demo"
    ? buildPhysicalProductDemoStep({
        productName: input.productName,
        frameIndex: demoFrame?.frameIndex || input.frameIndex,
        frameCount: demoFrame?.frameCount || input.frameCount,
      })
    : null;
  const digitalProductDemo = productVisible && input.plan.productRole === "digital_demo"
    ? buildDigitalProductDemoStep({
        productName: input.productName,
        frameIndex: demoFrame?.frameIndex || input.frameIndex,
        frameCount: demoFrame?.frameCount || input.frameCount,
        noPeopleReference,
      })
    : null;
  const productDemoStep = productDemo || digitalProductDemo;
  const visualAction = productDemoStep
    ? productDemoStep.action
    : layoutLocked
      ? visualActionSource
      : input.segmentIndex === 1 && input.plan.productRole === "hidden"
      ? renderIntroFrameAction(visualActionSource, isCutawayFrame, input.productName, referenceTransfer, facelessReferenceScene, voiceoverBrollReference, noPeopleReference)
        : productVisible
        ? renderProductFrameAction(visualActionSource, isCutawayFrame, input.productName, facelessReferenceScene, voiceoverBrollReference, noPeopleReference)
        : renderNonProductFrameAction(visualActionSource, isCutawayFrame, input.productName, facelessReferenceScene, voiceoverBrollReference, noPeopleReference);
  const productPlacement = renderStoryboardProductPlacement(
    input.plan,
    input.productName,
    input.productVisualPassport,
    input.productPhysicalHint,
    productVisible,
    referenceTransfer,
    productDemoStep?.placement
  );
  const finalVisualAction = layoutLocked || productDemoStep
    ? visualAction
    : repairReferenceAction({
        action: visualAction,
        spokenText: input.spokenText,
        productName: input.productName,
        productVisible,
        referenceSupportProps: referenceTransfer.requiredSupportProps,
      });
  const deliveryVisualAction = applySpeechModeToAction(finalVisualAction, speechMode);
  const initialPhysicalPlan = buildPhysicalFramePlan({
    productName: input.productName,
    spokenText: input.spokenText,
    visualAction: deliveryVisualAction,
    camera: renderStoryboardFrameCamera({ isCutawayFrame, directorCamera: renderDirectorCamera(input.directorBrief, productVisible, referenceProfile), productVisible, productRole: input.plan.productRole, cameraComposition: referenceTransfer.cameraComposition, facelessReferenceScene, objectOnlyReferenceScene, voiceoverBrollReference, noPeopleReference, speechMode }),
    productPlacement,
    speechMode,
  });
  const repairedVisualAction = repairPhysicalFrameAction({
    productName: input.productName,
    visualAction: deliveryVisualAction,
    plan: initialPhysicalPlan,
  });
  const storyboardVisualAction = input.referenceSceneMode === "voiceover_broll"
    ? sanitizeVoiceoverBrollStoryboardText(repairedVisualAction)
    : isFacelessReferenceScene(input.referenceSceneMode)
    ? sanitizeFacelessStoryboardText(repairedVisualAction, input.referenceSceneMode)
    : repairedVisualAction;
  const storyboardCamera = input.referenceSceneMode === "voiceover_broll"
    ? sanitizeVoiceoverBrollStoryboardText(renderStoryboardFrameCamera({ isCutawayFrame, directorCamera: renderDirectorCamera(input.directorBrief, productVisible, referenceProfile), productVisible, productRole: input.plan.productRole, cameraComposition: referenceTransfer.cameraComposition, facelessReferenceScene, objectOnlyReferenceScene, voiceoverBrollReference, noPeopleReference, speechMode }))
    : isFacelessReferenceScene(input.referenceSceneMode)
    ? sanitizeFacelessStoryboardText(renderStoryboardFrameCamera({ isCutawayFrame, directorCamera: renderDirectorCamera(input.directorBrief, productVisible, referenceProfile), productVisible, productRole: input.plan.productRole, cameraComposition: referenceTransfer.cameraComposition, facelessReferenceScene, objectOnlyReferenceScene, speechMode }), input.referenceSceneMode)
    : renderStoryboardFrameCamera({ isCutawayFrame, directorCamera: renderDirectorCamera(input.directorBrief, productVisible, referenceProfile), productVisible, productRole: input.plan.productRole, cameraComposition: referenceTransfer.cameraComposition, facelessReferenceScene, objectOnlyReferenceScene, speechMode });
  const physicalPlan = repairedVisualAction === deliveryVisualAction
    ? initialPhysicalPlan
    : buildPhysicalFramePlan({
        productName: input.productName,
        spokenText: input.spokenText,
        visualAction: repairedVisualAction,
        camera: renderStoryboardFrameCamera({ isCutawayFrame, directorCamera: renderDirectorCamera(input.directorBrief, productVisible, referenceProfile), productVisible, productRole: input.plan.productRole, cameraComposition: referenceTransfer.cameraComposition, facelessReferenceScene, objectOnlyReferenceScene, voiceoverBrollReference, noPeopleReference, speechMode }),
        productPlacement,
        speechMode,
      });

  return {
    spokenText: input.spokenText,
    visualAction: storyboardVisualAction,
    camera: storyboardCamera,
    environment: renderDirectorEnvironment(input.directorBrief, referenceProfile),
    wardrobe: renderStoryboardWardrobe({ characterContract: input.characterContract, brief: input.directorBrief, referenceProfile, wardrobeSource: input.wardrobeSource, referenceFormatMode: input.referenceFormatMode, referenceSceneMode: input.referenceSceneMode }),
    productPlacement,
    sfxNotes: isCutawayFrame
      ? productVisible
        ? "естественный звук короткого действия с продуктом"
        : "естественный звук предметов и окружения текущей сцены"
      : "тихие естественные звуки комнаты и живой речи",
    effectNotes: renderFrameTransitionNote(input.directorBrief, input.frameIndex),
    modelMusicNotes: null,
    speechMode,
    physicalPlan,
    referenceTransfer,
  };
}

function applySpeechModeToAction(action: string, speechMode: DirectorSegmentProfile["speech_mode"]) {
  if (speechMode !== "voiceover_only") return action;
  return action && !/voiceover|закадр|b-roll|перебив/iu.test(action)
    ? `${action}; самостоятельная B-roll сцена, речь звучит за кадром`
    : action || "самостоятельная B-roll сцена по текущей реплике, речь звучит за кадром";
}

function renderDirectorEnvironment(brief?: DirectorBrief | null, profile?: DirectorSegmentProfile | null) {
  const parts = [
    profile?.setting || profile?.environment || profile?.lighting || brief?.atmosphere.lighting,
    brief?.atmosphere.color_grading,
    brief?.atmosphere.mood,
  ].filter(Boolean);
  return parts.length
    ? normalizeVehicleContext(`LIGHT AND MOOD INSPIRATION: ${parts.join("; ")}; choose a new location for the current line`)
    : "выбери ясное окружение и свет для текущей реплики";
}

function renderDirectorCamera(
  brief: DirectorBrief | null | undefined,
  productVisible: boolean,
  profile?: DirectorSegmentProfile | null
) {
  if (!brief) return "";
  const camera = profile?.camera || brief.camera;
  const shotTypes = productVisible
    ? camera.shot_types
    : camera.shot_types.filter((shotType) => !/product|packag|продукт|упаков/iu.test(shotType));
  return normalizeVehicleContext(compactText([
    "camera inspiration:",
    shotTypes.join(", "),
    camera.angles.length ? `angles ${camera.angles.join(", ")}` : "",
    camera.movements.length ? `movement ${camera.movements.join(", ")}` : "",
    camera.stabilization, profile?.composition ? `composition ${profile.composition}` : "",
    "choose the clearest angle for the current beat",
  ].filter(Boolean).join("; "), 220));
}

function renderFrameAction(action: string | undefined, isCutawayFrame: boolean, facelessReferenceScene = false, voiceoverBrollReference = false, noPeopleReference = false) {
  const normalized = compactText(action || (facelessReferenceScene
    ? "руки выполняют действие по текущей реплике"
    : noPeopleReference
      ? "самостоятельный атмосферный B-roll по текущей реплике, без людей и рук"
    : voiceoverBrollReference
      ? "видимый B-roll субъект выполняет действие по текущей реплике"
      : "персонаж естественно говорит в камеру"), 220);
  if (/REFERENCE LAYOUT|collage\/PIP/iu.test(normalized)) return normalized;
  const visualCue = extractVisualCue(normalized);
  if (visualCue) {
    return isCutawayFrame
      ? `короткая перебивка: ${visualCue}`
      : facelessReferenceScene
        ? `руки выполняют действие по текущей реплике, визуальный ориентир: ${visualCue}`
        : noPeopleReference
          ? `самостоятельный атмосферный B-roll по текущей реплике, визуальный ориентир: ${visualCue}, без людей и рук`
        : voiceoverBrollReference
          ? `видимый B-roll субъект выполняет действие по текущей реплике, визуальный ориентир: ${visualCue}`
        : `персонаж говорит в камеру, визуальный ориентир: ${visualCue}`;
  }
  return compactText(normalized, 180);
}

function renderProductFrameAction(action: string | undefined, isCutawayFrame: boolean, productName: string, facelessReferenceScene = false, voiceoverBrollReference = false, noPeopleReference = false) {
  const rendered = renderFrameAction(action, isCutawayFrame, facelessReferenceScene, voiceoverBrollReference, noPeopleReference);
  if (mentionsOmniProduct(rendered, productName)) return rendered;
  return facelessReferenceScene
    ? `${rendered}; рука естественно берет ${productName} и ставит его на ту же поверхность, упаковка повернута лицевой стороной к камере`
    : noPeopleReference
      ? `${rendered}; утвержденный продукт ${productName} показывается крупно на устойчивой поверхности без людей и рук`
    : voiceoverBrollReference
      ? `${rendered}; видимый B-roll субъект естественно показывает ${productName} только по смыслу реплики`
    : `${rendered}; герой естественно берет ${productName} в одну руку на уровне груди, упаковка повернута лицевой стороной к камере`;
}

function renderNonProductFrameAction(action: string | undefined, isCutawayFrame: boolean, productName: string, facelessReferenceScene = false, voiceoverBrollReference = false, noPeopleReference = false) {
  const normalized = compactText(action || "", 220);
  const hasProductCue = mentionsOmniProduct(normalized, productName) || /(?:\bproduct\b|продукт|товар|упаков)/iu.test(normalized);
  if (!hasProductCue) return renderFrameAction(action, isCutawayFrame, facelessReferenceScene, voiceoverBrollReference, noPeopleReference);
  return isCutawayFrame
    ? "смысловая перебивка по текущей реплике без товара"
    : facelessReferenceScene
      ? "руки выполняют спокойное действие по текущей реплике, без товара в кадре"
      : noPeopleReference
        ? "самостоятельный атмосферный B-roll по текущей реплике, без товара, людей и рук"
      : voiceoverBrollReference
        ? "видимый B-roll субъект выполняет спокойное действие по текущей реплике, без товара в кадре"
      : "персонаж говорит в камеру, спокойный жест руками, без товара в кадре";
}

function renderIntroFrameAction(
  action: string | undefined,
  isCutawayFrame: boolean,
  productName: string,
  referenceTransfer: ReturnType<typeof buildReferenceTransferFramePlan>,
  facelessReferenceScene = false,
  voiceoverBrollReference = false,
  noPeopleReference = false
) {
  const normalized = compactText(action || "", 220);
  const visualCue = extractVisualCue(normalized) || normalized;
  const support = renderRequiredReferenceSupport(referenceTransfer);
  if (visualCue && !mentionsOmniProduct(visualCue, productName)) {
    return isCutawayFrame
      ? `смысловой предметный или атмосферный кадр по хуку: ${visualCue}`
      : support
        ? `${visualCue}; ${support}; реквизит остается видимым в нижней части кадра`
        : facelessReferenceScene
        ? `руки выполняют действие по хуку, ${visualCue}`
          : noPeopleReference
            ? `самостоятельный атмосферный B-roll по хуку, ${visualCue}, без людей и рук`
          : voiceoverBrollReference
            ? `видимый B-roll субъект выполняет действие по хуку, ${visualCue}`
          : `персонаж с пустыми руками, ${visualCue}`;
  }
  return isCutawayFrame
    ? "смысловой кадр окружения по теме хука"
      : facelessReferenceScene
        ? `руки выполняют действие по хуку; ${support || "реквизит остается видимым в нижней части кадра"}`
        : noPeopleReference
          ? `самостоятельный атмосферный B-roll по хуку, без людей и рук; ${support || "видимые объекты соответствуют reference-сцене"}`
        : voiceoverBrollReference
          ? `видимый B-roll субъект выполняет действие по хуку; ${support || "субъект остается естественно встроен в reference-сцену"}`
        : support
          ? `персонаж естественно говорит в камеру; ${support}; реквизит остается видимым в нижней части кадра`
          : "персонаж с пустыми руками естественно говорит в камеру";
}

function renderProfileAction(profile?: DirectorSegmentProfile | null) {
  if (!profile) return "";
  return compactText(
    [sanitizeReferenceActionDescription(profile.visual_description || profile.action_description), profile.actor_gesture].filter(Boolean).join("; "),
    220
  );
}

function isReferenceCutawayAction(action: string) {
  return /background|cutaway|insert|overlay|product close|macro|крупн(?:ый|ом) кадр|перебив|предметн(?:ый|ая) кадр|фон меня/iu.test(action);
}

function sanitizeReferenceActionDescription(value: string) {
  const normalized = compactText(value, 160);
  if (!normalized || /retinol|spf|collagen|cream|powder|principle|крем|пудр|ретинол|спф|коллаген|принцип|кож|уход|косметолог|врач|ретинолов/iu.test(normalized)) {
    return "";
  }
  return normalized;
}

function normalizeDefaultFrameAction(action: string | undefined, noPeopleReference = false) {
  const normalized = compactText(action || "", 220);
  if (noPeopleReference) return normalized ? `самостоятельный атмосферный B-roll по текущей реплике; ${normalized}; без людей и рук` : "самостоятельный атмосферный B-roll по текущей реплике, без людей и рук";
  if (/короткая\s+(?:спокойная\s+)?предметная|middle cutaway|смысловая перебивка/iu.test(normalized)) {
    return "персонаж продолжает говорить в камеру с осмысленным жестом по текущей реплике";
  }
  return normalized || "персонаж естественно говорит в камеру с небольшим изменением жеста";
}

function extractVisualCue(value: string) {
  const cue = value.match(/visual cue сценариста:\s*([^;.]+)/iu)?.[1] ||
    value.match(/Сценарный visual cue:\s*([^;.]+)/iu)?.[1] ||
    value.match(/Сценарный visual plan:\s*[^:]+:\s*([^|.]+)/iu)?.[1];
  return cue ? compactText(cue, 140) : "";
}

function compactText(value: string, maxLength: number) {
  const cleaned = value
    .replace(/PRODUCT VISUAL PASSPORT:/giu, "")
    .replace(/-\s*Must preserve:/giu, "")
    .replace(/\s+/gu, " ")
    .trim();
  if (cleaned.length <= maxLength) return cleaned;
  const clipped = cleaned.slice(0, maxLength).replace(/\s+\S*$/u, "").trim();
  return clipped || cleaned.slice(0, maxLength).trim();
}
