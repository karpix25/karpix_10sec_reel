import type { OmniClientAvatar, OmniProduct } from "@/lib/omni/types";
import {
  resolveNarratorSpeechGender,
  type OmniAvatarSpeechGender,
} from "../../omni/avatar-speech-gender";
import { renderRussianSpeechGenderRule } from "./russian-speech-gender-contract";
import { requiresContinuousPresenterWardrobe, type DirectorWardrobeContinuity } from "./director-wardrobe";
import { isAvatarFreeReferenceScene, isFacelessReferenceScene, isObjectOnlyReferenceScene, type ReferenceSceneMode } from "./omni-reference-scene-mode";
import type { ReferenceFormatMode } from "./omni-reference-format-mode";
import { normalizeOmniWardrobeSource, type OmniWardrobeSource } from "../../omni/wardrobe-source";

export type OmniCharacterClothingSource =
  | "product_avatar_notes"
  | "avatar_prompt"
  | "fallback";

export interface OmniCharacterContract {
  identityLine: string;
  clothingLine: string;
  sourceRuleLine: string;
  clothingSource: OmniCharacterClothingSource;
  speechGender: OmniAvatarSpeechGender;
  speechGenderLine: string;
}

const CLOTHING_PATTERNS = [
  /(?:одежд[аыеу]?|образ|лук)\s*[:\-]/iu,
  /\b(?:outfit|wearing|wears|dressed)\b/iu,
  /футболк|рубашк|худи|свитер|свитшот|толстовк|плать|джинс|брюк|штан|костюм|куртк|пиджак|юбк|топ|майк|фартук|форм[аеуы]|униформ|халат|жилет|кроссовк|ботинк|туфл|обув/iu,
] as const;

const FALLBACK_CLOTHING =
  "один фиксированный бытовой outfit: однотонный светлый верх без логотипов, нейтральные брюки или джинсы, простая обувь; одежда не меняется между частями";

export function buildOmniCharacterContract(input: {
  product: Pick<OmniProduct, "avatar_reference_notes">;
  avatar: Pick<OmniClientAvatar, "display_name" | "prompt" | "reference_url" | "kie_character_id" | "speech_gender"> | null;
  referenceSceneMode?: ReferenceSceneMode;
  referenceFormatMode?: ReferenceFormatMode;
  wardrobeSource?: OmniWardrobeSource;
  wardrobeContinuity?: DirectorWardrobeContinuity;
}): OmniCharacterContract {
  const avatarName = cleanText(input.avatar?.display_name);
  const avatarPrompt = cleanText(input.avatar?.prompt);
  const speechGender = resolveNarratorSpeechGender(
    input.avatar?.speech_gender,
    isAvatarFreeReferenceScene(input.referenceSceneMode)
  );
  const productAvatarNotes = cleanText(input.product.avatar_reference_notes);
  const clothingFromProduct = extractClothingDescription(productAvatarNotes);
  const clothingFromAvatar = extractClothingDescription(avatarPrompt);
  const wardrobeContinuity = requiresContinuousPresenterWardrobe(input)
    ? "stable"
    : input.wardrobeContinuity || "stable";
  const allowsReferenceWardrobeVariation = normalizeOmniWardrobeSource(input.wardrobeSource) !== "avatar_reference" &&
    wardrobeContinuity !== "stable";
  const clothing = clothingFromProduct || clothingFromAvatar || FALLBACK_CLOTHING;
  const clothingLine = allowsReferenceWardrobeVariation
    ? removeFixedClothingLanguage(clothing).replace(/^один фиксированный/iu, "базовый")
    : clothing;

  return {
    identityLine: input.referenceSceneMode === "voiceover_broll"
      ? "любой главный или акцентный человек в B-roll использует сохранённый аватар; фоновые люди допустимы; поза, взгляд и видимая речь выбираются по новой раскадровке"
      : isObjectOnlyReferenceScene(input.referenceSceneMode)
      ? "в кадре только утверждённая поверхность, предметы и концептуальные пропы; человек, руки, лицо, голова и портрет аватара не показываются; голос за кадром"
      : isFacelessReferenceScene(input.referenceSceneMode)
        ? "в кадре только руки и необходимый body crop; лицо, голова и портрет аватара не показываются; голос за кадром"
      : buildIdentityLine({ avatarName, avatarPrompt, hasAvatarReference: hasAvatarReference(input.avatar) }),
    clothingLine: input.referenceSceneMode === "voiceover_broll" && wardrobeContinuity !== "stable"
      ? "лицо, волосы, возраст, телосложение и личность аватара фиксированы character_id/reference image; одежда выбирается по новой сцене и не является QA контрактом"
      : clothingLine,
    sourceRuleLine: input.referenceSceneMode === "voiceover_broll" && wardrobeContinuity !== "stable"
      ? "источник лица, возраста, телосложения и личности главного героя - avatar reference/character_id; локацию, свет, действие и одежду режиссёр выбирает под текущую реплику"
      : allowsReferenceWardrobeVariation
      ? "источник outfit для каждой независимой сцены - соответствующий reference-кадр и строка ОДЕЖДА; товарные image_urls задают продукт, а не одежду героя; лицо, волосы и личность сохраняются у одного персонажа"
      : "единственный источник outfit - строка ОДЕЖДА и описание главного персонажа; товарные image_urls задают продукт, а не одежду героя; одежда сохраняется одинаковой во всех частях",
    clothingSource: clothingFromProduct ? "product_avatar_notes" : clothingFromAvatar ? "avatar_prompt" : "fallback",
    speechGender,
    speechGenderLine: renderRussianSpeechGenderRule(speechGender),
  };
}

function buildIdentityLine(input: {
  avatarName: string | null;
  avatarPrompt: string | null;
  hasAvatarReference: boolean;
}) {
  const namePart = input.avatarName ? `главный персонаж - ${input.avatarName}` : "главный персонаж - живой человек из сценария";
  const referencePart = input.hasAvatarReference
    ? "лицо, возраст, телосложение и общий типаж брать из переданного character_id/reference image"
    : "если передан character_id/reference image, он задает лицо, возраст, телосложение и общий типаж";
  const promptPart = input.avatarPrompt ? `описание персонажа: ${limitText(input.avatarPrompt, 220)}` : null;
  return [namePart, referencePart, promptPart].filter(Boolean).join("; ");
}

function extractClothingDescription(value: string | null) {
  if (!value) return null;
  const sentences = splitIntoSentences(value);
  const marked = sentences.find(hasClothingMarker);
  if (marked) return normalizeClothingLine(marked);
  if (value.length <= 180 && hasClothingMarker(value)) return normalizeClothingLine(value);
  return null;
}

function hasClothingMarker(value: string) {
  return CLOTHING_PATTERNS.some((pattern) => pattern.test(value));
}

function normalizeClothingLine(value: string) {
  const cleaned = limitText(cleanText(value) || "", 220);
  if (!cleaned) return null;
  return `${cleaned}; этот outfit фиксирован для всех частей`;
}

function removeFixedClothingLanguage(value: string) {
  return value
    .replace(/;\s*этот outfit фиксирован для всех частей/giu, "")
    .replace(/;\s*одежда не меняется между частями/giu, "")
    .trim();
}

function splitIntoSentences(value: string) {
  return value
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasAvatarReference(
  avatar: Pick<OmniClientAvatar, "reference_url" | "kie_character_id"> | null
) {
  return Boolean(cleanText(avatar?.reference_url) || cleanText(avatar?.kie_character_id));
}

function cleanText(value: string | null | undefined) {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  return cleaned || null;
}

function limitText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3).trim()}...`;
}
