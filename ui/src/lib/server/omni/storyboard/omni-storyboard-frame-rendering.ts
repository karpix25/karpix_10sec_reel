import type { OmniCharacterContract } from "../omni-character-contract";
import type { DirectorBrief, DirectorSegmentProfile } from "../director-analysis-types";
import type { ReferenceFormatMode } from "../omni-reference-format-mode";
import { isObjectOnlyReferenceScene, type ReferenceSceneMode } from "../omni-reference-scene-mode";
import { normalizeOmniWardrobeSource, type OmniWardrobeSource } from "../../../omni/wardrobe-source";
import type { PhysicalSpeechMode } from "../../../omni/physical-scene-types";
import { resolveDirectorVisibleSubjectPolicy } from "../director-visibility-policy";

const EXACT_FABRIC_LOCK =
  "ONE EXACT FABRIC FOR THE WHOLE REEL: preserve the same fiber material, weave, density, surface texture, seams, cut, and fit established in the first frame across every frame and segment";

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
    return `${input.directorCamera}; ${input.cameraComposition ? `КОМПОЗИЦИЯ REFERENCE: ${input.cameraComposition}; ` : ""}тот же исходный ракурс и направление камеры, что в соответствующем reference-кадре${input.noPeopleReference ? "; в кадре нет людей и рук" : input.isCutawayFrame || input.facelessReferenceScene || input.voiceoverBrollReference || input.speechMode === "voiceover_only" ? "" : "; герой смотрит прямо в объектив"}`;
  }
  if (input.noPeopleReference) return "независимый атмосферный B-roll ракурс по соответствующему reference-кадру, без людей и рук";
  if (input.objectOnlyReferenceScene) return "стабильный object-only макро ракурс, та же поверхность и направление камеры во всех кадрах";
  if (input.facelessReferenceScene) return "стабильный hands-only ракурс, та же поверхность и направление камеры во всех кадрах";
  if (input.voiceoverBrollReference || input.speechMode === "voiceover_only") return "независимый B-roll ракурс по соответствующему reference-кадру, без обязательного взгляда в объектив";
  if (!input.isCutawayFrame) return "стабильный talking-head ракурс, тот же фон и направление камеры во всех кадрах, герой смотрит прямо в объектив";
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
  if (isObjectOnlyReferenceScene(input.referenceSceneMode)) {
    return "WARDROBE: not applicable; no person or hands are visible";
  }
  if (resolveDirectorVisibleSubjectPolicy(input.brief) === "no_people") {
    return "WARDROBE: not applicable; no person or hands are visible";
  }
  if (normalizeOmniWardrobeSource(input.wardrobeSource) === "avatar_reference") {
    return `${input.characterContract.clothingLine}; ${EXACT_FABRIC_LOCK}`;
  }
  return renderReferenceWardrobe({
    brief: input.brief,
    referenceProfile: input.referenceProfile,
    referenceSceneMode: input.referenceSceneMode,
    referenceFormatMode: input.referenceFormatMode,
  });
}

export function renderReferenceWardrobe(input: {
  brief?: DirectorBrief | null;
  referenceProfile?: DirectorSegmentProfile | null;
  referenceFormatMode?: ReferenceFormatMode;
  referenceSceneMode?: ReferenceSceneMode;
}) {
  if (isObjectOnlyReferenceScene(input.referenceSceneMode) || resolveDirectorVisibleSubjectPolicy(input.brief) === "no_people") {
    return "WARDROBE: not applicable; no person or hands are visible";
  }

  const brief = input.brief;
  const profileWardrobe = input.referenceProfile?.wardrobe;
  const policy = brief ? brief.wardrobe_continuity || "unknown" : "stable";
  const colors = brief?.clothing.color_palette.length
    ? `colors: ${brief.clothing.color_palette.join(", ")}`
    : "";

  if (policy === "not_visible") return "WARDROBE: not visible in the analyzed reference interval; do not invent clothing details";
  if (policy === "stable") {
    return [
      "WARDROBE: adapt main presenter outfit; REFERENCE WARDROBE LOCK:",
      brief?.clothing.style,
      brief?.clothing.fit_details,
      colors,
      "ONE EXACT OUTFIT FOR THE ANALYZED CONTINUOUS SUBJECT: keep the same garments, layers, fit, accessories, and color placement",
      EXACT_FABRIC_LOCK,
    ].filter(Boolean).join("; ");
  }
  if (profileWardrobe?.visible && profileWardrobe.description) {
    return [
      "WARDROBE: adapt main presenter outfit in this source interval; REFERENCE WARDROBE:",
      profileWardrobe.description,
      `subject: ${profileWardrobe.subject_id}`,
      "keep the current interval outfit only; do not carry it into unrelated cuts",
    ].join("; ");
  }
  return [
    "WARDROBE: adapt main presenter style from the current analyzed reference interval only",
    brief?.clothing.style,
    brief?.clothing.fit_details,
    colors,
    brief?.clothing.adaptation_notes,
    "do not infer global wardrobe continuity from the format or from another cut",
  ].filter(Boolean).join("; ");
}
