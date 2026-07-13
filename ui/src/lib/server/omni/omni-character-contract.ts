import type { OmniClientAvatar, OmniProduct } from "@/lib/omni/types";

export type OmniCharacterClothingSource =
  | "product_avatar_notes"
  | "avatar_prompt"
  | "fallback";

export interface OmniCharacterContract {
  identityLine: string;
  clothingLine: string;
  sourceRuleLine: string;
  clothingSource: OmniCharacterClothingSource;
}

const CLOTHING_PATTERNS = [
  /(?:одежд[аыеу]?|образ|лук)\s*[:\-]/iu,
  /\b(?:outfit|wearing|wears|dressed)\b/iu,
  /футболк|рубашк|худи|свитер|плать|джинс|брюк|костюм|куртк|пиджак|юбк|кроссовк/iu,
] as const;

const FALLBACK_CLOTHING =
  "один фиксированный бытовой outfit: однотонный светлый верх без логотипов, нейтральные брюки или джинсы, простая обувь; одежда не меняется между частями";

export function buildOmniCharacterContract(input: {
  product: Pick<OmniProduct, "avatar_reference_notes">;
  avatar: Pick<OmniClientAvatar, "display_name" | "prompt" | "reference_url" | "kie_character_id"> | null;
}): OmniCharacterContract {
  const avatarName = cleanText(input.avatar?.display_name);
  const avatarPrompt = cleanText(input.avatar?.prompt);
  const productAvatarNotes = cleanText(input.product.avatar_reference_notes);
  const clothingFromProduct = extractClothingDescription(productAvatarNotes);
  const clothingFromAvatar = extractClothingDescription(avatarPrompt);
  const clothing = clothingFromProduct || clothingFromAvatar || FALLBACK_CLOTHING;

  return {
    identityLine: buildIdentityLine({ avatarName, avatarPrompt, hasAvatarReference: hasAvatarReference(input.avatar) }),
    clothingLine: clothing,
    sourceRuleLine:
      "единственный источник outfit - строка ОДЕЖДА и описание главного персонажа; товарные image_urls задают продукт, а не одежду героя; одежда сохраняется одинаковой во всех частях",
    clothingSource: clothingFromProduct ? "product_avatar_notes" : clothingFromAvatar ? "avatar_prompt" : "fallback",
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
