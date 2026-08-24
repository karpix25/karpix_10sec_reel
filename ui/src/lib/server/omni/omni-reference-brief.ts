import type { OmniCreativeStrategy } from "@/lib/omni/creative-contract";
import { normalizeOmniWardrobeSource, type OmniWardrobeSource } from "../../omni/wardrobe-source";
import { selectDirectorSegmentProfile, type DirectorBrief, type DirectorLocationTimelineItem } from "./director-analysis-types";
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
import { resolveDirectorVisibleSubjectPolicy } from "./director-visibility-policy";
import { renderReferenceWardrobe } from "./storyboard/omni-storyboard-frame-rendering";

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
  const styleOnly = policy.mode === "style_only";
  const location = selectDirectorLocationForSegment(input);
  const montageReference = isVoiceoverMontageReference(resolveReferenceFormatMode(input.brief));
  const wardrobeContinuity = input.brief.wardrobe_continuity || "unknown";
  const referenceProfile = selectDirectorSegmentProfile({
    brief: input.brief,
    segmentIndex: input.segmentIndex,
    segmentCount: input.segmentCount,
    frameIndex: 1,
    frameCount: 1,
  });
  const facelessReferenceScene = isFacelessReferenceScene(input.referenceSceneMode);
  const voiceoverBrollReference = input.referenceSceneMode === "voiceover_broll";
  const noPeopleReference = resolveDirectorVisibleSubjectPolicy(input.brief) === "no_people";
  const objectOnlyReferenceScene = isObjectOnlyReferenceScene(input.referenceSceneMode);
  return {
    referenceLine: styleOnly ? [
      `REFERENCE INSPIRATION: part ${input.segmentIndex}/${input.segmentCount}; preserve only the macro ${montageReference ? "montage" : "continuous"} format, broad visual mood, and pace range.`,
      "Create original product-relevant scenes and beats for the current spoken line. Exact source locations, actions, props, people, clothes, and cut timings are not a contract.",
      objectOnlyReferenceScene ? "Keep the macro object-only format." : facelessReferenceScene ? "Keep the macro faceless crop." : "Any featured human uses the saved avatar; natural background people are allowed.",
    ].join(" ") : [
      objectOnlyReferenceScene
        ? `REFERENCE: object-only part ${input.segmentIndex}/${input.segmentCount}; preserve the approved surface, props, macro camera, light, and action order. No avatar or person is visible.`
        : facelessReferenceScene
          ? `REFERENCE: faceless part ${input.segmentIndex}/${input.segmentCount}; preserve the approved hands, body crop, props, macro camera, light, and action order. No face or avatar is visible.`
          : voiceoverBrollReference
            ? noPeopleReference
              ? `REFERENCE: voiceover B-roll part ${input.segmentIndex}/${input.segmentCount}; preserve independent cutaways and off-camera narration with no visible people or hands.`
              : `REFERENCE: voiceover B-roll part ${input.segmentIndex}/${input.segmentCount}; preserve independent cutaways and off-camera narration while keeping the saved avatar as the silent visual protagonist.`
          : montageReference
        ? `REFERENCE: independent montage part ${input.segmentIndex}/${input.segmentCount}; preserve the same avatar identity and product story, but use the matching reference cut for this part.`
        : `REFERENCE: part ${input.segmentIndex}/${input.segmentCount}; continue the same avatar identity and product story.`,
      objectOnlyReferenceScene
        ? "Use the reference video for macro surface, environment, lighting, camera framing, conceptual props, and physical action only."
        : facelessReferenceScene
          ? "Use the reference video for environment, lighting, camera framing, hands, props, and physical action only."
          : voiceoverBrollReference
            ? noPeopleReference
              ? "Use the reference video for independent locations, objects, approved product screens, lighting, camera framing, and cut rhythm; do not add people or hands."
              : "Use the reference video for independent locations, visible B-roll actions, lighting, camera framing, and cut rhythm; use the saved avatar reference for the recurring visual identity."
          : "Use the reference video for location, environment, lighting, camera framing, and adapted outfit style only.",
      objectOnlyReferenceScene || wardrobeContinuity === "changes_between_cuts" || wardrobeContinuity === "unknown"
        ? "Do not force wardrobe, location, prop position, or physical action continuity where the director analysis marks independent cuts."
        : "",
      policy.mode === "style_only"
        ? voiceoverBrollReference
          ? "Use only the independent B-roll visual feel, camera, and light quality; omit unrelated reference-world objects, workflows, uniforms, and product category details."
          : "Use only the main presenter setup, visual feel, and light quality; omit unrelated reference-world objects, workflows, uniforms, and product category details."
        : "",
    ].filter(Boolean).join(" "),
    locationLine: styleOnly
      ? "LOCATION: choose a believable product- and narration-relevant location; borrow only the broad color and light mood from the reference."
      : renderLocationLine(input.brief, location),
    cameraLine: styleOnly
      ? "CAMERA/LIGHT: choose clear natural vertical framing for the current beat; reference shot scale and movement are optional inspiration."
      : renderCameraLine(input.brief),
    wardrobeLine: styleOnly
      ? objectOnlyReferenceScene || facelessReferenceScene || noPeopleReference
        ? "WARDROBE: not applicable to the approved visible-subject crop."
        : `WARDROBE: use a simple scene-appropriate outfit for the saved avatar; ${input.characterContract?.clothingLine || "exact reference clothing is not required"}.`
      : objectOnlyReferenceScene
      ? "WARDROBE: not applicable; no person, hands, face, or avatar is visible."
      : facelessReferenceScene
        ? "WARDROBE: not applicable to the visible crop; do not add a face, head, or avatar reference."
      : voiceoverBrollReference
          ? noPeopleReference
            ? "WARDROBE: not applicable; no person or hands are visible."
            : shouldUseAvatarWardrobe(wardrobeSource)
              ? `Wardrobe: use the avatar outfit only; ${input.characterContract?.clothingLine || "keep the avatar reference outfit unchanged"}; ignore clothing from the reference video.`
              : renderReferenceWardrobe({
                brief: input.brief,
                referenceProfile,
                referenceFormatMode: resolveReferenceFormatMode(input.brief),
                referenceSceneMode: input.referenceSceneMode,
              })
        : shouldUseAvatarWardrobe(wardrobeSource)
      ? `Wardrobe: use the avatar outfit only; ${input.characterContract?.clothingLine || "keep the avatar reference outfit unchanged"}; ignore clothing from the reference video.`
          : renderReferenceWardrobe({
            brief: input.brief,
            referenceProfile,
            referenceFormatMode: resolveReferenceFormatMode(input.brief),
            referenceSceneMode: input.referenceSceneMode,
          }),
    actionLine: styleOnly
      ? objectOnlyReferenceScene
        ? "DIRECTOR ACTION: create a simple original object-only beat for the current line."
        : facelessReferenceScene
          ? "DIRECTOR ACTION: create a simple original hands or body-crop beat for the current line."
          : "DIRECTOR ACTION: create an original observable beat for the current line; if a featured person appears, use the saved avatar."
      : objectOnlyReferenceScene
      ? "REFERENCE ACTION: preserve the macro surface, conceptual props, and simple treatment beat; no human presence or hand interaction."
      : voiceoverBrollReference
        ? noPeopleReference
          ? "REFERENCE ACTION: preserve independent B-roll actions and off-camera narration; show only the observed locations, objects, approved product screens, and natural movement."
          : "REFERENCE ACTION: preserve independent B-roll actions and off-camera narration; the saved avatar performs the visible actions without lip-sync."
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
  const voiceoverBrollReference = input.referenceSceneMode === "voiceover_broll";
  const noPeopleReference = resolveDirectorVisibleSubjectPolicy(input.brief) === "no_people";
  return {
    referenceLine: objectOnlyReferenceScene
      ? `REFERENCE: object-only part ${input.segmentIndex}/${input.segmentCount}; no avatar or person is visible.`
      : facelessReferenceScene
        ? `REFERENCE: faceless part ${input.segmentIndex}/${input.segmentCount}; no face or avatar is visible.`
        : voiceoverBrollReference
          ? noPeopleReference
            ? `REFERENCE: voiceover B-roll part ${input.segmentIndex}/${input.segmentCount}; no people or hands are visible.`
            : `REFERENCE INSPIRATION: voiceover B-roll part ${input.segmentIndex}/${input.segmentCount}; create an original scene for the current line and use the saved avatar for any featured human.`
        : `REFERENCE: part ${input.segmentIndex}/${input.segmentCount}; continue the same avatar identity and product story.`,
    locationLine: `LOCATION: ${input.strategy?.setting || "ordinary believable real-life setting"}.`,
    cameraLine: "CAMERA/LIGHT: natural phone footage, simple framing, believable room light.",
    wardrobeLine: objectOnlyReferenceScene || facelessReferenceScene || voiceoverBrollReference
      ? noPeopleReference
        ? "WARDROBE: not applicable; no person or hands are visible."
        : "WARDROBE: use a simple outfit appropriate to the new scene; clothing is not a QA contract."
      : `WARDROBE: ${input.characterContract?.clothingLine || "consistent avatar outfit"}.`,
    actionLine: objectOnlyReferenceScene
      ? "ACTION: simple object-only movement with conceptual props, no human presence."
      : voiceoverBrollReference
        ? noPeopleReference
          ? "ACTION: direct an original location, object, or approved product-screen beat for the current narration, with no people."
          : "ACTION: direct an original B-roll action for the current narration; any featured human uses the saved avatar."
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
    return "DIRECTOR ACTION: create an original product-relevant beat for the current line; follow the approved digital or physical product contract.";
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
