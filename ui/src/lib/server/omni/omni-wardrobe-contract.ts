import type { OmniWardrobeSource } from "../../omni/wardrobe-source";
import type { OmniCharacterContract } from "./omni-character-contract";

export function shouldUseAvatarWardrobe(source: OmniWardrobeSource) {
  return source === "avatar_reference";
}

export function renderAvatarWardrobeLine(characterContract: OmniCharacterContract) {
  return [
    "AVATAR WARDROBE LOCK:",
    characterContract.clothingLine,
    "Outfit source is the avatar reference and avatar prompt only.",
    "Do not copy, inherit, recolor, simplify, or restyle clothing from the director reference video.",
    "The director reference may control framing, lighting, action rhythm, camera movement, gestures, and edit timing only.",
    "Keep the same avatar outfit, silhouette, color palette, texture, accessories, and formality in every segment.",
  ].join(" ");
}

export function renderAvatarWardrobeSourceRule(characterContract: OmniCharacterContract) {
  return [
    characterContract.sourceRuleLine,
    "When a director reference is present, ignore its wardrobe and preserve the avatar outfit as the only clothing source.",
  ].join(" ");
}

export function applyWardrobeSourceToReferenceLock(input: {
  referenceLockLine: string;
  wardrobeSource: OmniWardrobeSource;
}) {
  if (!shouldUseAvatarWardrobe(input.wardrobeSource)) return input.referenceLockLine;
  const withoutWardrobe = input.referenceLockLine
    .replace(/main-presenter wardrobe,\s*/iu, "")
    .replace(/wardrobe,\s*/iu, "")
    .replace(/ for wardrobe,/iu, " for")
    .replace(/,\s*wardrobe/iu, "");

  return [
    withoutWardrobe,
    "WARDROBE EXCEPTION: do not transfer clothing from the director reference; avatar reference is the only wardrobe source.",
  ].join(" ");
}
