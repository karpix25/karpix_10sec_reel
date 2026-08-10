import type { OmniPromptValidationResult, OmniSegmentCreativePlan } from "../../../omni/creative-contract";
import {
  OMNI_STORYBOARD_MAX_FRAME_WORDS,
  OMNI_STORYBOARD_MIN_FRAME_WORDS,
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
import { normalizeOmniWardrobeSource, type OmniWardrobeSource } from "../../../omni/wardrobe-source";
import {
  mentionsOmniProduct,
} from "../omni-intro-product-contract";
import { renderFrameTransitionNote } from "./omni-storyboard-effects";
import {
  buildPhysicalFramePlan,
  buildProductPresentationAction,
  isProductPresentationCue,
  normalizeVehicleContext,
  repairReferenceAction,
  repairPhysicalFrameAction,
} from "../physical-scene-model";
import { splitStoryboardSpeech } from "./omni-storyboard-speech";
import { buildStoredStoryboardFrame } from "./omni-stored-storyboard-frame-repair";

const EXACT_FABRIC_LOCK =
  "ONE EXACT FABRIC FOR THE WHOLE REEL: preserve the same fiber material, weave, density, surface texture, seams, cut, and fit established in the first frame across every frame and segment";

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
}): OmniStoryboardSegment {
  const frameCount = getOmniStoryboardFrameCount(input.durationSeconds);
  if (!frameCount) throw new Error(`Storyboard segment ${input.segmentIndex} has unsupported duration ${input.durationSeconds}`);
  const words = input.plan.voiceoverText.trim().split(/\s+/u).filter(Boolean);
  const minWords = frameCount * OMNI_STORYBOARD_MIN_FRAME_WORDS;
  const maxWords = frameCount * OMNI_STORYBOARD_MAX_FRAME_WORDS;
  if (words.length < minWords || words.length > maxWords) {
    throw new Error(`Storyboard segment ${input.segmentIndex} needs ${minWords}-${maxWords} words, got ${words.length}`);
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
}): OmniStoryboardSegment {
  if (!input.frames.length) throw new Error(`Storyboard segment ${input.segmentIndex} has no frames`);
  return {
    segmentIndex: input.segmentIndex,
    durationSeconds: input.durationSeconds,
    voiceoverText: input.voiceoverText,
    frames: input.frames.map((frame, index) => {
      const isFrameHidden = /(?:продукт|товар)\s+(?:вне\s+кадра|не\s+виден|скрыт)|hidden|off\s*camera/iu.test(frame.productState || "");
      const productVisible = !isFrameHidden && mentionsOmniProduct(frame.spokenWords, input.productName);
      const referenceProfile = selectDirectorSegmentProfile({
        brief: input.directorBrief,
        segmentIndex: input.segmentIndex,
        segmentCount: input.segmentCount || 1,
        frameIndex: index + 1,
        frameCount: input.frames.length,
      });
      return buildStoredStoryboardFrame({
        frame,
        productName: input.productName,
        productPhysicalHint: input.productPhysicalHint,
        productVisible,
        referenceProfile,
      });
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
  segmentIndex: number;
  segmentCount?: number;
  spokenText: string;
  frameIndex: number;
  frameCount: number;
}): OmniStoryboardFrame {
  const startSeconds = (input.frameIndex - 1) * 2;
  const beat = input.plan.beats.find((item) => startSeconds >= item.startSeconds && startSeconds < item.endSeconds) ||
    input.plan.beats[0];
  const layoutLocked = /REFERENCE LAYOUT|collage\/PIP/iu.test(beat?.action || "");
  const productVisible = input.plan.productRole !== "hidden" &&
    !isArticleCtaOnly(input.spokenText) &&
    mentionsOmniProduct(input.spokenText, input.productName);
  const referenceProfile = selectDirectorSegmentProfile({
    brief: input.directorBrief,
    segmentIndex: input.segmentIndex,
    segmentCount: input.segmentCount || 1,
    frameIndex: input.frameIndex,
    frameCount: input.frameCount,
  });
  const referenceAction = layoutLocked
    ? ""
    : renderProfileAction(referenceProfile);
  const visualActionSource = layoutLocked
    ? beat?.action || ""
    : repairReferenceAction({
        action: referenceAction || normalizeDefaultFrameAction(beat?.action),
        spokenText: input.spokenText,
        productName: input.productName,
        productVisible,
      });
  const isCutawayFrame = Boolean(referenceAction && isReferenceCutawayAction(referenceAction));
  const presentationAction = productVisible && isProductPresentationCue(input.spokenText)
    ? buildProductPresentationAction(input.productName)
    : null;
  const visualAction = layoutLocked
    ? visualActionSource
    : input.segmentIndex === 1 && input.plan.productRole === "hidden"
      ? renderIntroFrameAction(visualActionSource, isCutawayFrame, input.productName)
      : productVisible
        ? renderProductFrameAction(presentationAction || visualActionSource, isCutawayFrame, input.productName)
        : renderNonProductFrameAction(visualActionSource, isCutawayFrame, input.productName);
  const finalVisualAction = layoutLocked
    ? visualAction
    : repairReferenceAction({
        action: visualAction,
        spokenText: input.spokenText,
        productName: input.productName,
        productVisible,
      });
  const initialPhysicalPlan = buildPhysicalFramePlan({
    productName: input.productName,
    spokenText: input.spokenText,
    visualAction: finalVisualAction,
    camera: renderFrameCamera(isCutawayFrame, renderDirectorCamera(input.directorBrief, productVisible, referenceProfile), productVisible, input.plan.productRole),
    productPlacement: renderProductPlacement(input.plan, input.productName, input.productVisualPassport, input.productPhysicalHint, input.segmentIndex, productVisible),
  });
  const repairedVisualAction = repairPhysicalFrameAction({
    productName: input.productName,
    visualAction: finalVisualAction,
    plan: initialPhysicalPlan,
  });
  const physicalPlan = repairedVisualAction === finalVisualAction
    ? initialPhysicalPlan
    : buildPhysicalFramePlan({
        productName: input.productName,
        spokenText: input.spokenText,
        visualAction: repairedVisualAction,
        camera: renderFrameCamera(isCutawayFrame, renderDirectorCamera(input.directorBrief, productVisible, referenceProfile), productVisible, input.plan.productRole),
        productPlacement: renderProductPlacement(input.plan, input.productName, input.productVisualPassport, input.productPhysicalHint, input.segmentIndex, productVisible),
      });

  return {
    spokenText: input.spokenText,
    visualAction: repairedVisualAction,
    camera: renderFrameCamera(
      isCutawayFrame,
      renderDirectorCamera(input.directorBrief, productVisible, referenceProfile),
      productVisible,
      input.plan.productRole
    ),
    environment: renderDirectorEnvironment(input.directorBrief, referenceProfile),
    wardrobe: renderStoryboardWardrobe(input.characterContract, input.directorBrief, input.wardrobeSource),
    productPlacement: renderProductPlacement(
      input.plan,
      input.productName,
      input.productVisualPassport,
      input.productPhysicalHint,
      input.segmentIndex,
      productVisible
    ),
    sfxNotes: isCutawayFrame
      ? productVisible
        ? "естественный звук короткого действия с продуктом"
        : "естественный звук предметов и окружения текущей сцены"
      : "тихие естественные звуки комнаты и живой речи",
    effectNotes: renderFrameTransitionNote(input.directorBrief, input.frameIndex),
    modelMusicNotes: null,
    physicalPlan,
  };
}

function renderFrameCamera(
  isCutawayFrame: boolean,
  directorCamera: string,
  productVisible: boolean,
  productRole?: string
) {
  if (directorCamera) {
    return `${directorCamera}; тот же исходный ракурс и направление камеры, что в соответствующем reference-кадре${isCutawayFrame ? "" : "; герой смотрит прямо в объектив"}`;
  }
  const base = isCutawayFrame
    ? productVisible
      ? productRole === "background_prop"
        ? "смысловая перебивка: блогерская сцена по реплике, продукт только как второстепенная деталь окружения"
        : "смысловая перебивка: крупный кадр продукта в естественном окружении"
      : "смысловая перебивка: предметный или атмосферный кадр по текущей реплике"
    : "стабильный talking-head ракурс, тот же фон и направление камеры во всех кадрах, герой смотрит прямо в объектив";
  return base;
}

function renderDirectorEnvironment(brief?: DirectorBrief | null, profile?: DirectorSegmentProfile | null) {
  const timeline = brief?.location_timeline?.[0];
  const parts = [
    profile?.setting || timeline?.setting || brief?.atmosphere.setting,
    profile?.environment || timeline?.environment,
    profile?.lighting || timeline?.lighting || brief?.atmosphere.lighting,
    brief?.atmosphere.color_grading,
    brief?.atmosphere.mood,
  ].filter(Boolean);
  return parts.length
    ? normalizeVehicleContext(`REFERENCE SCENE LOCK: ${parts.join("; ")}`)
    : "то же окружение и свет, что заданы сценой сегмента";
}

function renderStoryboardWardrobe(
  characterContract: OmniCharacterContract,
  brief?: DirectorBrief | null,
  wardrobeSource?: OmniWardrobeSource
) {
  if (normalizeOmniWardrobeSource(wardrobeSource) === "avatar_reference") {
    return `${characterContract.clothingLine}; ${EXACT_FABRIC_LOCK}`;
  }
  if (characterContract.speechGender === "male" && isClearlyFemaleWardrobe(brief)) {
    return `${characterContract.clothingLine}; ${EXACT_FABRIC_LOCK}`;
  }
  if (!brief?.clothing.style) return `${characterContract.clothingLine}; ${EXACT_FABRIC_LOCK}`;
  const colors = brief.clothing.color_palette.length ? `colors: ${brief.clothing.color_palette.join(", ")}` : "";
  return [
    "REFERENCE WARDROBE LOCK:",
    brief.clothing.style,
    brief.clothing.fit_details,
    colors,
    "ONE EXACT OUTFIT FOR THE WHOLE REEL: keep the same garments, layers, neckline, sleeves, fit, accessories, and color placement in every frame and every segment",
    "EXACT COLOR LOCK: copy the exact hue, wash, pattern scale, contrast, and color placement from the first frame; a light-wash denim stays the same light-wash denim and never becomes dark denim",
    EXACT_FABRIC_LOCK,
    "if a jacket, blazer, overshirt, or shirt layer is present, it stays on and is not replaced by a t-shirt or a different shirt",
  ].filter(Boolean).join("; ");
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
    "reference camera lock:",
    shotTypes.join(", "),
    camera.angles.length ? `angles ${camera.angles.join(", ")}` : "",
    camera.movements.length ? `movement ${camera.movements.join(", ")}` : "",
    camera.stabilization,
  ].filter(Boolean).join("; "), 220));
}

function renderProductPlacement(
  plan: OmniSegmentCreativePlan,
  productName: string,
  productVisualPassport?: string | null,
  productPhysicalHint?: string | null,
  segmentIndex?: number,
  productVisible = false
) {
  const productDetails = productVisualPassport ? `, детали из референса: ${compactProductReference(productVisualPassport)}` : "";
  if (plan.productRole === "hidden") return "продукт вне кадра в этом сегменте";
  if (!productVisible) {
    return "в кадре только тематические объекты и окружение текущей реплики";
  }
  if (plan.productRole === "background_prop") {
    return appendProductPhysicalHint(
      `${productName} может быть виден только как небольшой вспомогательный предмет: стоит на поверхности в блогерской сцене, без крупного рекламного плана и без демонстрации этикетки${productDetails}`,
      productPhysicalHint
    );
  }
  if (plan.productRole === "brief_demo") {
    return appendProductPhysicalHint(
      `${productName} обязательно физически виден в коротком действии с рукой${productDetails}`,
      productPhysicalHint
    );
  }
  if (plan.productRole === "natural_use") {
    return appendProductPhysicalHint(
      `${productName} обязательно физически виден и используется как естественный предмет сцены${productDetails}`,
      productPhysicalHint
    );
  }
  return appendProductPhysicalHint(
    `${productName} обязательно физически виден как реальный предмет в окружении${productDetails}`,
    productPhysicalHint
  );
}

function isArticleCtaOnly(text: string) {
  return /артикул|описани|под\s+видео|ниже/iu.test(text) &&
    !/использ|нанос|готов|полож|выбр|покаж|держ|бер|пью|принима|умыва|запека|жар|режим/iu.test(text);
}

function appendProductPhysicalHint(base: string, productPhysicalHint?: string | null) {
  const hint = productPhysicalHint?.trim();
  return hint ? `${base}; ${hint}` : base;
}

function isClearlyFemaleWardrobe(brief?: DirectorBrief | null) {
  const clothing = [
    brief?.clothing.style,
    brief?.clothing.fit_details,
    ...(brief?.clothing.color_palette || []),
  ].filter(Boolean).join(" ");
  return /halter|bra\b|bustier|corset|dress|skirt|women'?s|feminine|бюстгальтер|корсет|плать|юбк|женск|топ\s+на\s+бретел/iu.test(clothing);
}

function renderFrameAction(action: string | undefined, isCutawayFrame: boolean) {
  const normalized = compactText(action || "персонаж естественно говорит в камеру", 220);
  if (/REFERENCE LAYOUT|collage\/PIP/iu.test(normalized)) return normalized;
  const visualCue = extractVisualCue(normalized);
  if (visualCue) {
    return isCutawayFrame
      ? `короткая перебивка: ${visualCue}`
      : `персонаж говорит в камеру, визуальный ориентир: ${visualCue}`;
  }
  return compactText(normalized, 180);
}

function renderProductFrameAction(action: string | undefined, isCutawayFrame: boolean, productName: string) {
  const rendered = renderFrameAction(action, isCutawayFrame);
  if (mentionsOmniProduct(rendered, productName)) return rendered;
  return `${rendered}; герой естественно берет ${productName} в одну руку на уровне груди, упаковка повернута лицевой стороной к камере`;
}

function renderNonProductFrameAction(action: string | undefined, isCutawayFrame: boolean, productName: string) {
  const normalized = compactText(action || "", 220);
  const hasProductCue = mentionsOmniProduct(normalized, productName) || /(?:\bproduct\b|продукт|товар|упаков)/iu.test(normalized);
  if (!hasProductCue) return renderFrameAction(action, isCutawayFrame);
  return isCutawayFrame
    ? "смысловая перебивка по текущей реплике без товара"
    : "персонаж говорит в камеру, спокойный жест руками, без товара в кадре";
}

function renderIntroFrameAction(action: string | undefined, isCutawayFrame: boolean, productName: string) {
  const normalized = compactText(action || "", 220);
  const visualCue = extractVisualCue(normalized) || normalized;
  if (visualCue && !mentionsOmniProduct(visualCue, productName)) {
    return isCutawayFrame
      ? `смысловой предметный или атмосферный кадр по хуку: ${visualCue}`
      : `персонаж с пустыми руками, ${visualCue}`;
  }
  return isCutawayFrame
    ? "смысловой кадр окружения по теме хука"
    : "персонаж с пустыми руками естественно говорит в камеру";
}

function renderProfileAction(profile?: DirectorSegmentProfile | null) {
  if (!profile) return "";
  return compactText(
    [sanitizeReferenceActionDescription(profile.action_description), profile.actor_gesture].filter(Boolean).join("; "),
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

function normalizeDefaultFrameAction(action: string | undefined) {
  const normalized = compactText(action || "", 220);
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

function compactProductReference(value: string) {
  const lines = value.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const preferredLabels = ["Prompt summary", "Must preserve", "Physical form", "Exact visible colors", "Materials and finish"];
  const preferred = preferredLabels
    .map((label) => lines.find((line) => new RegExp(`^-\\s*${label}:`, "iu").test(line)) || "")
    .map((line) => line.replace(/^-\s*[^:]+:\s*/u, ""))
    .find(Boolean);
  return compactText(preferred || value, 160);
}
