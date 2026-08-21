import type { OmniCreativeStrategy } from "@/lib/omni/creative-contract";
import { normalizeOmniWardrobeSource, type OmniWardrobeSource } from "../../omni/wardrobe-source";
import type { DirectorBrief, DirectorLocationTimelineItem } from "./director-analysis-types";
import type { OmniCharacterContract } from "./omni-character-contract";
import {
  resolveReferenceTransferPolicy,
  type ReferenceTransferPolicy,
} from "./omni-reference-transfer-policy";
import { sanitizeCameraStabilizationForPrompt } from "./omni-scene-safety-contract";
import { sanitizeReferenceActionDna, sanitizeReferenceWorldText } from "./omni-scene-world-sanitizer";
import { shouldUseAvatarWardrobe } from "./omni-wardrobe-contract";
import { isVoiceoverMontageReference, resolveReferenceFormatMode } from "./omni-reference-format-mode";
import { isFacelessReferenceScene, isObjectOnlyReferenceScene, type ReferenceSceneMode } from "./omni-reference-scene-mode";

export type CompactReferenceBriefInput = {
  brief: DirectorBrief | null;
  strategy?: OmniCreativeStrategy;
  characterContract?: OmniCharacterContract;
  segmentIndex: number;
  segmentCount: number;
  segmentStartSeconds: number;
  segmentEndSeconds: number;
  segmentDurationSeconds?: number;
  wardrobeSource?: OmniWardrobeSource;
  referencePolicy?: ReferenceTransferPolicy;
  referenceSceneMode?: ReferenceSceneMode;
};

type DirectorLocationRange = DirectorLocationTimelineItem;

export function buildCompactReferenceBrief(input: CompactReferenceBriefInput) {
  if (!input.brief) return fallbackReferenceBrief(input);
  const wardrobeSource = normalizeOmniWardrobeSource(input.wardrobeSource);
  const policy = resolveReferenceTransferPolicy(input.referencePolicy);
  const location = selectDirectorLocationForSegment(input);
  const montageReference = isVoiceoverMontageReference(resolveReferenceFormatMode(input.brief));
  const facelessReferenceScene = isFacelessReferenceScene(input.referenceSceneMode);
  const objectOnlyReferenceScene = isObjectOnlyReferenceScene(input.referenceSceneMode);
  return {
    referenceLine: [
      objectOnlyReferenceScene
        ? `REFERENCE: object-only part ${input.segmentIndex}/${input.segmentCount}; preserve the approved surface, props, macro camera, light, and action order. No avatar or person is visible.`
        : facelessReferenceScene
          ? `REFERENCE: faceless part ${input.segmentIndex}/${input.segmentCount}; preserve the approved hands, body crop, props, macro camera, light, and action order. No face or avatar is visible.`
          : montageReference
        ? `REFERENCE: independent montage part ${input.segmentIndex}/${input.segmentCount}; preserve the same avatar identity and product story, but use the matching reference cut for this part.`
        : `REFERENCE: part ${input.segmentIndex}/${input.segmentCount}; continue the same avatar identity and product story.`,
      objectOnlyReferenceScene
        ? "Use the reference video for macro surface, environment, lighting, camera framing, conceptual props, and physical action only."
        : facelessReferenceScene
          ? "Use the reference video for environment, lighting, camera framing, hands, props, and physical action only."
          : "Use the reference video for location, environment, lighting, camera framing, and adapted outfit style only.",
      objectOnlyReferenceScene || montageReference ? "Do not force wardrobe, location, prop position, or physical action continuity between independent cuts." : "",
      policy.mode === "style_only"
        ? "Use only the main presenter setup, visual feel, and light quality; omit unrelated reference-world objects, workflows, uniforms, and product category details."
        : "",
    ].filter(Boolean).join(" "),
    locationLine: renderLocationLine(input.brief, location),
    cameraLine: renderCameraLine(input.brief),
    wardrobeLine: objectOnlyReferenceScene
      ? "WARDROBE: not applicable; no person, hands, face, or avatar is visible."
      : facelessReferenceScene
        ? "WARDROBE: not applicable to the visible crop; do not add a face, head, or avatar reference."
        : shouldUseAvatarWardrobe(wardrobeSource)
      ? `Wardrobe: use the avatar outfit only; ${input.characterContract?.clothingLine || "keep the avatar reference outfit unchanged"}; ignore clothing from the reference video.`
      : renderAdaptedWardrobeLine(input.brief, policy, montageReference),
    actionLine: objectOnlyReferenceScene
      ? "REFERENCE ACTION: preserve the macro surface, conceptual props, and simple treatment beat; no human presence or hand interaction."
      : renderActionLine(input.brief, policy),
  };
}

export function renderCompactDirectorReferenceBrief(input: CompactReferenceBriefInput) {
  const brief = buildCompactReferenceBrief(input);
  return [
    brief.referenceLine,
    brief.locationLine,
    brief.cameraLine,
    brief.wardrobeLine,
    brief.actionLine,
  ].filter(Boolean).join("\n");
}

export function selectDirectorLocationForSegment(input: {
  brief: DirectorBrief | null;
  segmentStartSeconds: number;
  segmentEndSeconds: number;
}): DirectorLocationRange | null {
  const timeline = input.brief?.location_timeline || [];
  if (!timeline.length) return null;
  const segmentStart = Math.max(0, input.segmentStartSeconds);
  const segmentEnd = Math.max(segmentStart, input.segmentEndSeconds);
  const midpoint = (segmentStart + segmentEnd) / 2;
  const bestOverlap = timeline
    .map((item) => ({ item, overlap: getOverlapSeconds(item, segmentStart, segmentEnd) }))
    .sort((left, right) => right.overlap - left.overlap)[0];
  if (bestOverlap && bestOverlap.overlap > 0) return bestOverlap.item;
  return (
    timeline.find((item) => midpoint >= item.start_sec && midpoint < getEffectiveEndSeconds(item)) ||
    timeline.find((item) => segmentStart >= item.start_sec && segmentStart < getEffectiveEndSeconds(item)) ||
    timeline[Math.min(timeline.length - 1, Math.max(0, Math.floor(timeline.length / 2)))] ||
    null
  );
}

function fallbackReferenceBrief(input: CompactReferenceBriefInput) {
  const objectOnlyReferenceScene = isObjectOnlyReferenceScene(input.referenceSceneMode);
  const facelessReferenceScene = isFacelessReferenceScene(input.referenceSceneMode);
  return {
    referenceLine: objectOnlyReferenceScene
      ? `REFERENCE: object-only part ${input.segmentIndex}/${input.segmentCount}; no avatar or person is visible.`
      : facelessReferenceScene
        ? `REFERENCE: faceless part ${input.segmentIndex}/${input.segmentCount}; no face or avatar is visible.`
        : `REFERENCE: part ${input.segmentIndex}/${input.segmentCount}; continue the same avatar identity and product story.`,
    locationLine: `LOCATION: ${input.strategy?.setting || "ordinary believable real-life setting"}.`,
    cameraLine: "CAMERA/LIGHT: natural phone footage, simple framing, believable room light.",
    wardrobeLine: objectOnlyReferenceScene || facelessReferenceScene
      ? "WARDROBE: not applicable; do not add a person or avatar."
      : `WARDROBE: ${input.characterContract?.clothingLine || "consistent avatar outfit"}.`,
    actionLine: objectOnlyReferenceScene
      ? "ACTION: simple object-only movement with conceptual props, no human presence."
      : "ACTION: simple product-relevant movement, no filler choreography.",
  };
}

function renderLocationLine(brief: DirectorBrief, location: DirectorLocationRange | null) {
  const setting = sanitizeReferenceWorldText(
    location?.setting || brief.atmosphere.setting,
    "the matching reference-video setting for this time range"
  );
  const environment = sanitizeReferenceWorldText(
    location?.environment || brief.atmosphere.mood,
    "the matching reference-video environment"
  );
  const lighting = sanitizeReferenceWorldText(
    location?.lighting || brief.atmosphere.lighting,
    "the matching reference-video light quality"
  );
  return `LOCATION NOW: ${setting}; environment: ${environment}; light: ${lighting}.`;
}

function renderAdaptedWardrobeLine(brief: DirectorBrief, policy: ReferenceTransferPolicy, montageReference = false) {
  const colors = brief.clothing.color_palette.length
    ? `colors ${brief.clothing.color_palette.join(", ")}`
    : "same color mood";
  const adaptation = brief.clothing.adaptation_notes ||
    "adapt gendered garments to the avatar gender/body while preserving style, formality, silhouette, and mood";
  const wardrobe = [brief.clothing.style, brief.clothing.fit_details].join(" ");
  if (policy.mode === "style_only" && /uniform|lab coat|doctor|nurse|scrubs|gloves|medical|culinary|униформ|халат|перчат|врач|повар/iu.test(wardrobe)) {
    return `WARDROBE: use only the reference outfit formality, palette, and silhouette mood; ${colors}; ${adaptation}; omit uniforms, gloves, masks, aprons, and supporting-worker details.`;
  }
  return [
    `WARDROBE: adapt ${brief.clothing.source || "the main presenter outfit style"} to the avatar`,
    brief.clothing.style,
    brief.clothing.fit_details,
    colors,
    adaptation,
    montageReference
      ? "for each independent cut match the visible outfit in its corresponding reference frame; keep the same face, hair, age, body type, and identity"
      : "keep the same outfit across all parts",
  ].filter(Boolean).join("; ") + ".";
}

function renderCameraLine(brief: DirectorBrief) {
  const camera = [
    brief.camera.shot_types.join(", "),
    brief.camera.angles.length ? `angles ${brief.camera.angles.join(", ")}` : "",
    brief.camera.movements.length ? `movement ${brief.camera.movements.join(", ")}` : "",
    sanitizeCameraStabilizationForPrompt(brief.camera.stabilization),
  ].filter(Boolean).join("; ");
  return `CAMERA/LIGHT: ${camera || "natural phone footage, simple framing, believable room light"}.`;
}

function renderActionLine(brief: DirectorBrief, policy: ReferenceTransferPolicy) {
  if (policy.mode === "style_only") {
    return "REFERENCE ACTION: simple presenter confidence with product-relevant show-and-tell only; replace unrelated process inserts with physical product moments.";
  }
  const actions = brief.action_beats
    .slice(0, 2)
    .map((beat) => [beat.action_description, beat.actor_gesture].filter(Boolean).join(", "))
    .filter(Boolean);
  const mechanics = brief.reusable_mechanics.visual_mechanics.slice(0, 2);
  const useful = [...actions, ...mechanics].slice(0, 3);
  const safe = sanitizeReferenceActionDna(
    useful.join("; "),
    "simple presenter confidence with product-relevant show-and-tell only"
  );
  return safe ? `REFERENCE ACTION: ${safe}.` : "";
}

function getOverlapSeconds(item: DirectorLocationRange, segmentStart: number, segmentEnd: number) {
  const start = Math.max(item.start_sec, segmentStart);
  const end = Math.min(getEffectiveEndSeconds(item), segmentEnd);
  return Math.max(0, end - start);
}

function getEffectiveEndSeconds(item: DirectorLocationRange) {
  return item.end_sec > item.start_sec ? item.end_sec : Number.POSITIVE_INFINITY;
}
