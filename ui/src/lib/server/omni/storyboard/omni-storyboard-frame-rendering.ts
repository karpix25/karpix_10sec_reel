import type { OmniCharacterContract } from "../omni-character-contract";
import type { DirectorBrief, DirectorSegmentProfile } from "../director-analysis-types";
import type { ReferenceFormatMode } from "../omni-reference-format-mode";
import { isObjectOnlyReferenceScene, type ReferenceSceneMode } from "../omni-reference-scene-mode";
import { normalizeOmniWardrobeSource, type OmniWardrobeSource } from "../../../omni/wardrobe-source";
import type { PhysicalSpeechMode } from "../../../omni/physical-scene-types";
import { resolveDirectorVisibleSubjectPolicy } from "../director-visibility-policy";
import { requiresContinuousPresenterWardrobe } from "../director-wardrobe";

export function renderStoryboardFrameCamera(input: {
  isCutawayFrame: boolean;
  directorCamera: string;
  productVisible: boolean;
  productRole?: string;
  cameraComposition?: string | null;
  facelessReferenceScene?: boolean;
  voiceoverBrollReference?: boolean;
  objectOnlyReferenceScene?: boolean;
  noPeopleReference?: boolean;
  speechMode?: PhysicalSpeechMode;
}) {
  if (input.directorCamera) {
    const eyeContact = input.speechMode === "on_camera" && !input.isCutawayFrame
      ? "; герой смотрит прямо в объектив"
      : "";
    return `${input.directorCamera}; выбери ясный ракурс для текущей реплики${eyeContact}${input.noPeopleReference ? "; в кадре нет людей и рук" : ""}`;
  }
  if (input.noPeopleReference) return "самостоятельный атмосферный B-roll ракурс по текущей реплике, без людей и рук";
  if (input.objectOnlyReferenceScene) return "ясный object-only макро ракурс для текущего действия";
  if (input.facelessReferenceScene) return "ясный hands-only ракурс для текущего действия";
  if (input.voiceoverBrollReference || input.speechMode === "voiceover_only") return "самостоятельный B-roll ракурс по текущей реплике, без обязательного взгляда в объектив";
  if (!input.isCutawayFrame) return "естественный talking-head ракурс для текущей реплики";
  if (!input.productVisible) return "смысловая перебивка: предметный или атмосферный кадр по текущей реплике";
  return input.productRole === "background_prop"
    ? "смысловая перебивка: блогерская сцена по реплике, продукт только как второстепенная деталь окружения"
    : "смысловая перебивка: крупный кадр продукта в естественном окружении";
}

export function renderStoryboardWardrobe(input: {
  characterContract: OmniCharacterContract;
  brief?: DirectorBrief | null;
  referenceProfile?: DirectorSegmentProfile | null;
  wardrobeSource?: OmniWardrobeSource;
  referenceFormatMode?: ReferenceFormatMode;
  referenceSceneMode?: ReferenceSceneMode;
}) {
  if (input.referenceProfile?.avatar_allowed === false) {
    return "WARDROBE: not applicable to the featured avatar in this source interval";
  }
  if (isObjectOnlyReferenceScene(input.referenceSceneMode)) {
    return "WARDROBE: not applicable; no person or hands are visible";
  }
  if (resolveDirectorVisibleSubjectPolicy(input.brief) === "no_people") {
    return "WARDROBE: not applicable; no person or hands are visible";
  }
  const continuousPresenter = requiresContinuousPresenterWardrobe(input);
  if (normalizeOmniWardrobeSource(input.wardrobeSource) === "avatar_reference") {
    return continuousPresenter
      ? `${input.characterContract.clothingLine}; OUTFIT LOCK FOR ENTIRE REEL: keep the exact garment type, sleeve length, neckline, color, fabric, and visible accessories in every segment`
      : `${input.characterContract.clothingLine}; exact clothing is creative guidance, not a QA contract`;
  }
  return renderReferenceWardrobe({
    brief: input.brief,
    referenceProfile: input.referenceProfile,
    referenceSceneMode: input.referenceSceneMode,
    referenceFormatMode: input.referenceFormatMode,
    characterContract: input.characterContract,
  });
}

export function renderReferenceWardrobe(input: {
  brief?: DirectorBrief | null;
  referenceProfile?: DirectorSegmentProfile | null;
  referenceFormatMode?: ReferenceFormatMode;
  referenceSceneMode?: ReferenceSceneMode;
  characterContract?: OmniCharacterContract;
}) {
  if (input.referenceProfile?.avatar_allowed === false) {
    return "WARDROBE: not applicable to the featured avatar in this source interval";
  }
  if (isObjectOnlyReferenceScene(input.referenceSceneMode) || resolveDirectorVisibleSubjectPolicy(input.brief) === "no_people") {
    return "WARDROBE: not applicable; no person or hands are visible";
  }

  const brief = input.brief;
  const profileWardrobe = input.referenceProfile?.wardrobe;
  const policy = brief ? brief.wardrobe_continuity || "unknown" : "stable";
  const colors = brief?.clothing.color_palette.length
    ? `colors: ${brief.clothing.color_palette.join(", ")}`
    : "";
  const referenceStyle = [brief?.clothing.style, profileWardrobe?.description].filter(Boolean).join("; ");
  if (input.characterContract?.speechGender === "male" && isGenderCodedFeminineWardrobe(referenceStyle)) {
    return [
      "OUTFIT LOCK FOR ENTIRE REEL:",
      input.characterContract.clothingLine,
      "use an avatar-compatible male equivalent while preserving the source palette, material, silhouette, fit, and formality",
    ].filter(Boolean).join("; ");
  }

  if (requiresContinuousPresenterWardrobe(input)) {
    return [
      "OUTFIT LOCK FOR ENTIRE REEL:",
      brief?.clothing.style || "choose one simple scene-appropriate outfit in segment one",
      brief?.clothing.fit_details,
      colors,
      "keep the exact garment type, sleeve length, neckline, color, fabric, and visible accessories in every segment",
    ].filter(Boolean).join("; ");
  }

  if (policy === "not_visible") return "WARDROBE: not visible in the analyzed reference interval; do not invent clothing details";
  if (policy === "stable") return ["WARDROBE INSPIRATION:", brief?.clothing.style, colors, "choose a simple scene-appropriate outfit; exact source clothing and cross-segment continuity are not QA requirements"].filter(Boolean).join("; ");
  if (profileWardrobe?.visible && profileWardrobe.description) {
    return [
      "WARDROBE INSPIRATION:",
      profileWardrobe.description,
      "adapt freely to the new scene; exact source clothing is not a QA requirement",
    ].join("; ");
  }
  return [
    "WARDROBE INSPIRATION:",
    brief?.clothing.style,
    brief?.clothing.fit_details,
    colors,
    "choose a simple outfit for the new scene; clothing is not a QA contract",
  ].filter(Boolean).join("; ");
}

function isGenderCodedFeminineWardrobe(value: string) {
  return /halter|dress|skirt|юбк|плать|женск|декольте|бюстье/iu.test(value);
}
