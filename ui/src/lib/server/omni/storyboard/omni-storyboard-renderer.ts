import {
  validateOmniStoryboardSegment,
} from "../../../omni/storyboard/omni-storyboard-contract";
import type { OmniStoryboardSegment } from "../../../omni/storyboard/omni-storyboard-types";
import {
  OMNI_PRODUCT_FILE_PLACEHOLDER,
  OMNI_STORYBOARD_FILE_PLACEHOLDER,
} from "./omni-storyboard-file-reference";
import { isProductVisibleInStoryboardFrame } from "../omni-intro-product-contract";
import { renderProductPhysicalContractForOmni } from "../product-physical-contract";
import type { DirectorBrief } from "../director-analysis-types";
import { isCollagePictureInPictureReference } from "../director-layout-contract";
import { renderReferenceTransitionCue } from "./omni-storyboard-effects";
import { OMNI_PHYSICAL_ACTION_CONTRACT } from "../omni-physical-action-contract";
import { OMNI_NO_VISIBLE_FILMING_GEAR_PROMPT } from "../omni-scene-safety-contract";
import type { OmniCharacterContract } from "../omni-character-contract";
import { normalizeOmniWardrobeSource, type OmniWardrobeSource } from "../../../omni/wardrobe-source";

export function renderCompactRussianOmniStoryboardPrompt(input: {
  storyboard: OmniStoryboardSegment;
  productName?: string;
  productPhysicalContract?: string | null;
  segmentCount?: number;
  directorBrief?: DirectorBrief | null;
  characterContract?: OmniCharacterContract;
  wardrobeSource?: OmniWardrobeSource;
}) {
  const validation = validateOmniStoryboardSegment(input.storyboard);
  if (!validation.valid) {
    throw new Error(`Invalid Omni storyboard: ${validation.errors.join(", ")}`);
  }
  const voiceoverText = renderPunctuatedVoiceover(input.storyboard, input.segmentCount);
  const frameCount = input.storyboard.frames.length;
  const preservePipLayout = isCollagePictureInPictureReference(input.directorBrief || null);
  const productFrameNumbers = input.storyboard.frames
    .map((frame, index) => isProductVisibleInStoryboardFrame(frame as unknown as Record<string, unknown>, input.productName || "") ? index + 1 : null)
    .filter((index): index is number => index !== null);
  const productAppearsInThisSegment = productFrameNumbers.length > 0;
  const productRevealFrame = productFrameNumbers[0] || null;

  return [
    `Create one live-action vertical video from the single storyboard instruction board ${OMNI_STORYBOARD_FILE_PLACEHOLDER}.`,
    `The board contains exactly ${frameCount} ordered SHOT panels. Animate one shot per panel in the timestamped order below.`,
    "Preserve the storyboard composition, lighting, environment, decor, PIP or collage mechanics, visible format elements, and edit rhythm. Use the wardrobe authority below for clothing.",
    "Replace only the original performer with the supplied character identity and the original commercial product with the supplied product reference.",
    "Do not render the storyboard grid, separators, SHOT labels, instruction text, social interface, or subtitles.",
    preservePipLayout
      ? "FORMAT LOCK: keep the full-screen background and the avatar cutout in the lower-left PIP position shown on the storyboard."
      : "",
    OMNI_NO_VISIBLE_FILMING_GEAR_PROMPT,
    renderWardrobeAuthority(input),
    "Keep the same hair, parting, accessories, and complete outfit across every shot and segment.",
    renderWardrobeLock(input),
    renderReferenceTransitionCue(input.directorBrief),
    renderStoryboardTimeline(input.storyboard),
    renderVehicleCameraLock(input.directorBrief),
    "In every presenter shot, the character looks directly into the lens.",
    productAppearsInThisSegment
      ? `Use ${OMNI_PRODUCT_FILE_PLACEHOLDER} only for product identity. Reveal it first in SHOT ${shotLabel((productRevealFrame || 1) - 1)} and preserve its packaging, scale, state, hand, and physical position until a visible action moves it.`
      : "Keep the product outside the frame for this entire segment.",
    productAppearsInThisSegment
      ? "Keep one physically continuous product instance; never duplicate, teleport, or transform it."
      : "",
    productAppearsInThisSegment ? renderProductPhysicalContractForOmni(input.productPhysicalContract) : "",
    OMNI_PHYSICAL_ACTION_CONTRACT,
    "EXACT SPOKEN RUSSIAN LINE. Speak the quoted text once and say nothing else:",
    `"${voiceoverText}"`,
    "Deliver it naturally without long pauses. Never read technical instructions aloud. After the line, remain silent. No background music or subtitles.",
    `Use ${OMNI_STORYBOARD_FILE_PLACEHOLDER} as a visual reference board, not as a literal first frame.`,
  ].join("\n");
}

function renderStoryboardTimeline(storyboard: OmniStoryboardSegment) {
  const secondsPerShot = storyboard.durationSeconds / storyboard.frames.length;
  return storyboard.frames.map((frame, index) => {
    const start = formatSeconds(index * secondsPerShot);
    const end = formatSeconds((index + 1) * secondsPerShot);
    return [
      `[${start}-${end}s] Animate SHOT ${shotLabel(index)} from the storyboard.`,
      `Subject motion: ${frame.visualAction.trim()}.`,
      `Camera behavior: ${frame.camera.trim()}.`,
      frame.effectNotes ? `Transition behavior: ${frame.effectNotes.trim()}.` : "",
      "Keep every other visible detail exactly as shown in that SHOT panel.",
    ].filter(Boolean).join(" ");
  }).join("\n");
}

function shotLabel(index: number) {
  return String.fromCharCode(65 + index);
}

function formatSeconds(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function renderVehicleCameraLock(brief?: DirectorBrief | null) {
  if (!brief) return "";
  const referenceText = [
    brief.atmosphere.setting,
    brief.atmosphere.mood,
    ...brief.camera.shot_types,
    ...brief.action_beats.flatMap((beat) => [beat.action_description, beat.actor_gesture]),
  ].filter(Boolean).join(" ");
  if (!/(?:car|vehicle|automobile|машин|автомобил|салон|сидень|передн(?:ем|ее)|задн(?:ем|ее) сиденье)/iu.test(referenceText)) {
    return "";
  }
  return "VEHICLE CAMERA LOCK: keep one continuous camera setup inside the vehicle, with the same physical camera mount, same side of the cabin, same distance, same horizon and same seat for the woman in every frame and segment; preserve the exact front or rear seat shown in the reference; let only the visible reference cuts change the moment, never the seating position or camera location.";
}

function renderPunctuatedVoiceover(storyboard: OmniStoryboardSegment, segmentCount?: number) {
  const text = storyboard.voiceoverText.trim();
  if (/[?!]$/u.test(text)) return text;
  const mark = storyboard.segmentIndex === 1
    ? renderHookMark(text)
    : segmentCount && storyboard.segmentIndex === segmentCount
      ? "!"
      : "";
  return mark ? `${text.replace(/[.!…]+$/u, "")}${mark}` : text;
}

function renderHookMark(text: string) {
  return /^(?:почему|зачем|как|что|когда|если|вы|ты|знаете|знаешь)\b/iu.test(text) ? "?" : "!";
}

function renderWardrobeAuthority(input: {
  characterContract?: OmniCharacterContract;
  wardrobeSource?: OmniWardrobeSource;
}) {
  if (normalizeOmniWardrobeSource(input.wardrobeSource) === "avatar_reference") {
    return [
      "Use the supplied character identity for face, age, hair, body, identity, and outfit.",
      "Ignore clothing from the director reference images; the avatar reference and the wardrobe text in each storyboard panel are the only clothing sources.",
    ].join(" ");
  }
  return "Use the supplied character identity for face, age, hair, and body. The storyboard panel wardrobe is the adapted director-reference outfit; keep it unchanged across all shots and segments.";
}

function renderWardrobeLock(input: {
  brief?: DirectorBrief | null;
  characterContract?: OmniCharacterContract;
  wardrobeSource?: OmniWardrobeSource;
}): string {
  if (normalizeOmniWardrobeSource(input.wardrobeSource) === "avatar_reference" && input.characterContract) {
    return `AVATAR WARDROBE LOCK: ${input.characterContract.clothingLine}. Ignore wardrobe from the director reference; identical outfit in every segment and every frame.`;
  }
  const brief = input.brief;
  if (!brief) return "";
  const parts = [
    brief.clothing.style,
    brief.clothing.fit_details,
    brief.clothing.color_palette.length
      ? `colors: ${brief.clothing.color_palette.join(", ")}`
      : "",
    brief.clothing.adaptation_notes || "",
  ].filter(Boolean);
  if (!parts.length) return "";
  return `WARDROBE LOCK: ${parts.join("; ")}. Identical outfit in every segment and every frame — same fabric, cut, color, and accessories. Any deviation is a generation failure.`;
}
