import type { OmniCharacterContract } from "../omni-character-contract";
import type { DirectorBrief } from "../director-analysis-types";
import type { ReferenceFormatMode } from "../omni-reference-format-mode";
import { isObjectOnlyReferenceScene, type ReferenceSceneMode } from "../omni-reference-scene-mode";
import { isVoiceoverMontageReference } from "../omni-reference-format-mode";
import { normalizeOmniWardrobeSource, type OmniWardrobeSource } from "../../../omni/wardrobe-source";
import type { PhysicalSpeechMode } from "../../../omni/physical-scene-types";

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
  speechMode?: PhysicalSpeechMode;
}) {
  if (input.directorCamera) {
    return `${input.directorCamera}; ${input.cameraComposition ? `КОМПОЗИЦИЯ REFERENCE: ${input.cameraComposition}; ` : ""}тот же исходный ракурс и направление камеры, что в соответствующем reference-кадре${input.isCutawayFrame || input.facelessReferenceScene || input.voiceoverBrollReference || input.speechMode === "voiceover_only" ? "" : "; герой смотрит прямо в объектив"}`;
  }
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
  wardrobeSource?: OmniWardrobeSource;
  referenceFormatMode?: ReferenceFormatMode;
  referenceSceneMode?: ReferenceSceneMode;
}) {
  const montageReference = isVoiceoverMontageReference(input.referenceFormatMode);
  if (isObjectOnlyReferenceScene(input.referenceSceneMode)) {
    return "WARDROBE: not applicable; no person or hands are visible";
  }
  if (input.referenceSceneMode === "voiceover_broll") {
    return "WARDROBE: use only the visible clothing from the corresponding independent B-roll frame; keep the saved avatar face, hair, age, body type, and identity fixed";
  }
  if (normalizeOmniWardrobeSource(input.wardrobeSource) === "avatar_reference") {
    return `${input.characterContract.clothingLine}; ${EXACT_FABRIC_LOCK}`;
  }
  if (input.characterContract.speechGender === "male" && isClearlyFemaleWardrobe(input.brief)) {
    return montageReference
      ? `${input.characterContract.clothingLine}; match the corresponding reference frame for each independent cut; keep the same face, hair, age, body type, and identity`
      : `${input.characterContract.clothingLine}; ${EXACT_FABRIC_LOCK}`;
  }
  if (!input.brief?.clothing.style) {
    return montageReference
      ? `${input.characterContract.clothingLine}; outfit may follow each independent reference cut while identity remains fixed`
      : `${input.characterContract.clothingLine}; ${EXACT_FABRIC_LOCK}`;
  }
  const colors = input.brief.clothing.color_palette.length ? `colors: ${input.brief.clothing.color_palette.join(", ")}` : "";
  if (montageReference) {
    return [
      "REFERENCE WARDROBE STYLE:",
      input.brief.clothing.style,
      input.brief.clothing.fit_details,
      colors,
      "match the visible outfit in the corresponding reference cut; outfit may change between independent segments, while face, hair, age, body type, and presenter identity stay the same",
    ].filter(Boolean).join("; ");
  }
  return [
    "REFERENCE WARDROBE LOCK:",
    input.brief.clothing.style,
    input.brief.clothing.fit_details,
    colors,
    "ONE EXACT OUTFIT FOR THE WHOLE REEL: keep the same garments, layers, neckline, sleeves, fit, accessories, and color placement in every frame and every segment",
    "EXACT COLOR LOCK: copy the exact hue, wash, pattern scale, contrast, and color placement from the first frame; a light-wash denim stays the same light-wash denim and never becomes dark denim",
    EXACT_FABRIC_LOCK,
    "if a jacket, blazer, overshirt, or shirt layer is present, it stays on and is not replaced by a t-shirt or a different shirt",
  ].filter(Boolean).join("; ");
}

function isClearlyFemaleWardrobe(brief?: DirectorBrief | null) {
  const clothing = [
    brief?.clothing.style,
    brief?.clothing.fit_details,
    ...(brief?.clothing.color_palette || []),
  ].filter(Boolean).join(" ");
  return /halter|bra\b|bustier|corset|dress|skirt|women'?s|feminine|бюстгальтер|корсет|плать|юбк|женск|топ\s+на\s+бретел/iu.test(clothing);
}
