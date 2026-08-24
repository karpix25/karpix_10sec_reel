import type { OmniCharacterContract } from "../omni-character-contract";
import type { DirectorBrief, DirectorSegmentProfile } from "../director-analysis-types";
import type { ReferenceFormatMode } from "../omni-reference-format-mode";
import { isObjectOnlyReferenceScene, type ReferenceSceneMode } from "../omni-reference-scene-mode";
import { normalizeOmniWardrobeSource, type OmniWardrobeSource } from "../../../omni/wardrobe-source";
import type { PhysicalSpeechMode } from "../../../omni/physical-scene-types";
import { resolveDirectorVisibleSubjectPolicy } from "../director-visibility-policy";

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
    return `${input.directorCamera}; выбери ясный ракурс для текущей реплики${input.noPeopleReference ? "; в кадре нет людей и рук" : ""}`;
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
  if (isObjectOnlyReferenceScene(input.referenceSceneMode)) {
    return "WARDROBE: not applicable; no person or hands are visible";
  }
  if (resolveDirectorVisibleSubjectPolicy(input.brief) === "no_people") {
    return "WARDROBE: not applicable; no person or hands are visible";
  }
  if (normalizeOmniWardrobeSource(input.wardrobeSource) === "avatar_reference") {
    return `${input.characterContract.clothingLine}; exact clothing is creative guidance, not a QA contract`;
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
