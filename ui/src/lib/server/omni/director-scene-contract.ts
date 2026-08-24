import type { DirectorBrief, DirectorLocationTimelineItem } from "./director-analysis-types";
import { buildDirectorLayoutContract } from "./director-layout-contract";
import {
  DEFAULT_REFERENCE_TRANSFER_POLICY,
  type ReferenceTransferPolicy,
} from "./omni-reference-transfer-policy";
import {
  OMNI_NO_VISIBLE_FILMING_GEAR_PROMPT,
  sanitizeCameraStabilizationForPrompt,
} from "./omni-scene-safety-contract";
import {
  hasForeignReferenceWorld,
  sanitizeReferenceActionDna,
  sanitizeReferenceWorldText,
} from "./omni-scene-world-sanitizer";
import { selectDirectorLocationForSegment } from "./omni-reference-brief";

export type DirectorSceneContract = {
  referenceLockLine: string;
  framingLine: string;
  layoutLine?: string;
  sceneLine: string;
  cameraLightLine: string;
  wardrobeLine: string;
  editingLine: string;
  actionLine: string;
  propPassportLine: string;
  cleanFrameLine?: string;
};

type DirectorSceneContractOptions = {
  segmentStartSeconds?: number;
  segmentEndSeconds?: number;
};

type DirectorLocationRange = DirectorLocationTimelineItem;

export function buildDirectorSceneContract(
  brief: DirectorBrief | null,
  policy: ReferenceTransferPolicy = DEFAULT_REFERENCE_TRANSFER_POLICY,
  options: DirectorSceneContractOptions = {}
): DirectorSceneContract | null {
  if (!brief) return null;

  const wardrobe = [
    brief.clothing.style,
    brief.clothing.fit_details,
    brief.clothing.adaptation_notes,
    brief.clothing.color_palette.length ? `colors: ${brief.clothing.color_palette.join(", ")}` : "",
  ].filter(Boolean).join("; ");
  const camera = buildCameraDescription(brief);
  const actionDna = brief.action_beats
    .map((beat) => `${beat.timestamp_sec}s: ${beat.action_description}; ${beat.actor_gesture}`)
    .filter(Boolean)
    .join(" | ");
  const mechanics = [
    brief.reusable_mechanics.visual_mechanics.join("; "),
    brief.reusable_mechanics.looping_pattern ? `loop: ${brief.reusable_mechanics.looping_pattern}` : "",
  ].filter(Boolean).join("; ");
  const segmentLocation = selectDirectorLocationForSegment({
    brief,
    segmentStartSeconds: options.segmentStartSeconds || 0,
    segmentEndSeconds: options.segmentEndSeconds || options.segmentStartSeconds || 0,
  });
  const safeReferenceScene = buildSafeFullReferenceScene(brief, segmentLocation);
  const safeReferenceLighting = getTransferableLighting(brief);
  const safeActionDna = sanitizeReferenceActionDna(
    [actionDna, mechanics].filter(Boolean).join("; "),
    "main presenter explains to camera with natural gesture confidence and simple product-relevant inserts; omit unrelated reference-world objects."
  );
  const layoutContract = buildDirectorLayoutContract(brief, policy);

  if (policy.mode === "style_only") {
    return {
      referenceLockLine: [
        "REFERENCE INSPIRATION:",
        "borrow only the macro format, energy, lighting feel, broad framing, and editing language.",
        "Direct original scenes and visual beats for the current script; do not copy exact locations, actions, props, clothes, cut timings, or people.",
      ].join(" "),
      framingLine: [
        "CAMERA DIRECTION:",
        "use clear natural vertical framing inspired by the reference, but choose the shot that best communicates the current spoken beat.",
      ].filter(Boolean).join(" "),
      layoutLine: layoutContract?.layoutLine,
      sceneLine: [
        "ORIGINAL SCENE:",
        "choose a believable location and action that directly visualizes the current line and the client product.",
      ].filter(Boolean).join(" "),
      cameraLightLine: [
        "CAMERA AND LIGHT:",
        `borrow only the broad light mood: ${getTransferableLighting(brief)}; camera and movement are chosen for clarity.`,
        OMNI_NO_VISIBLE_FILMING_GEAR_PROMPT,
      ].filter(Boolean).join(" "),
      wardrobeLine: [
        "WARDROBE:",
        "keep the saved avatar identity; use a simple scene-appropriate outfit. Exact reference clothing is not a continuity or QA requirement.",
      ].filter(Boolean).join(" "),
      editingLine: [
        "EDITING:",
        "borrow the reference pace range and macro layout, then place clean cuts where the new script needs them. Exact source timestamps are not a contract.",
      ].filter(Boolean).join(" "),
      actionLine: [
        "DIRECTOR ACTION:",
        "create original observable beats from the current spoken line. If a featured human appears, use the saved avatar. Show the client product only in the approved physical or digital form.",
      ].join(" "),
      propPassportLine: [
        "PROP PASSPORT:",
        "use only simple props required by the current script or product; source products and unrelated reference props are excluded.",
      ].join(" "),
      cleanFrameLine: undefined,
    };
  }

  return {
    referenceLockLine: [
      "REFERENCE LOCK:",
      "match the original reference direction for adapted wardrobe style, lighting, camera framing, camera movement, gestures, and environment.",
      "Only two changes are allowed: remove all subtitles/overlays/interface elements, and replace any original product or brand with the new product.",
    ].join(" "),
    framingLine: [
      "REFERENCE FRAMING:",
      camera,
      "Do not override this with generic full-body, medium-wide, handheld, or fast-cut instructions unless those are explicitly in the reference.",
    ].filter(Boolean).join(" "),
    layoutLine: layoutContract?.layoutLine,
    sceneLine: [
      "REFERENCE SCENE:",
      safeReferenceScene,
    ].filter(Boolean).join(" "),
    cameraLightLine: [
      "REFERENCE CAMERA AND LIGHT:",
      camera,
      `lighting must follow the reference: ${safeReferenceLighting}`,
      OMNI_NO_VISIBLE_FILMING_GEAR_PROMPT,
    ].filter(Boolean).join(" "),
    wardrobeLine: [
      "REFERENCE WARDROBE:",
      wardrobe,
      "adapt the reference outfit style, fit, color palette, and formality to the avatar gender/body; face and body identity still come from the character_id/reference image.",
    ].filter(Boolean).join(" "),
    editingLine: [
      "EDITING:",
      "use simple natural cuts that fit the new product and current spoken line.",
      "Do not copy the reference speech tempo or edit rhythm; do not add subtitles, captions, or interface overlays.",
    ].filter(Boolean).join(" "),
    actionLine: layoutContract?.actionLine || [
      "REFERENCE ACTION DNA:",
      safeActionDna,
      "adapt the spoken script and product identity; keep gestures, posture, camera mechanics, and location continuity from the reference.",
    ].filter(Boolean).join(" "),
    propPassportLine: layoutContract?.propPassportLine || [
      "REFERENCE SCENE PASSPORT:",
      "keep only stable background elements implied by the reference environment and the product when its role allows it;",
      "replace the original reference product with the new product when the product is visible;",
      "do not use preset household, travel, office, or gym props that are not part of this reference scene.",
    ].join(" "),
    cleanFrameLine: layoutContract?.cleanFrameLine,
  };
}

const SUPPORTING_WARDROBE_PATTERN =
  /staff|workers|gloves|nitrile|culinary|medical uniform|uniform|lab coat|doctor|nurse|scrubs|перчат|работник|униформ|медицинск|врач|медсестр|повар/iu;

function buildCameraDescription(brief: DirectorBrief) {
  return [
    brief.camera.shot_types.join(", "),
    brief.camera.angles.length ? `angles: ${brief.camera.angles.join(", ")}` : "",
    brief.camera.movements.length ? `movement: ${brief.camera.movements.join(", ")}` : "",
    sanitizeCameraStabilizationForPrompt(brief.camera.stabilization),
  ].filter(Boolean).join("; ");
}

function buildTransferableStyleOnlyScene(brief: DirectorBrief, location: DirectorLocationRange | null) {
  const setting = location?.setting || brief.atmosphere.setting || "";
  const environment = location?.environment || brief.atmosphere.mood;
  const lighting = location?.lighting || brief.atmosphere.lighting;
  const fallback =
    "keep only the main presenter setup and background color mood from the reference; omit unrelated B-roll locations and reference-world decor.";
  const safeSetting = hasForeignReferenceWorld(setting)
    ? "keep only the main presenter setup and background color mood from the reference; omit unrelated B-roll locations and process rooms."
    : `match the main presenter background from the reference: ${sanitizeReferenceWorldText(setting, fallback)}`;
  return [
    safeSetting,
    `environment: ${sanitizeReferenceWorldText(environment, "direct, informative, natural")}`,
    `light: ${sanitizeReferenceWorldText(lighting, "copy only the main-presenter light quality")}`,
    `grade: ${sanitizeReferenceWorldText(brief.atmosphere.color_grading, "natural phone color with the reference contrast level")}`,
  ].filter(Boolean).join("; ");
}

function buildSafeFullReferenceScene(brief: DirectorBrief, location: DirectorLocationRange | null) {
  const setting = sanitizeReferenceWorldText(
    location?.setting || brief.atmosphere.setting,
    "main presenter setup from the reference, stripped of unrelated set-specific decor and tools"
  );
  const environment = sanitizeReferenceWorldText(location?.environment || brief.atmosphere.mood, "direct, informative, natural");
  const lighting = sanitizeReferenceWorldText(location?.lighting || brief.atmosphere.lighting, "copy the main-presenter light direction, contrast, softness, and color mood");
  const grade = sanitizeReferenceWorldText(
    brief.atmosphere.color_grading,
    "natural phone color with the reference contrast level"
  );
  return [
    setting,
    `environment: ${environment}`,
    `light: ${lighting}`,
    `grade: ${grade}`,
  ].filter(Boolean).join("; ");
}

function getTransferableLighting(brief: DirectorBrief) {
  const lighting = brief.atmosphere.lighting || "";
  if (hasForeignReferenceWorld(lighting)) {
    return "copy only the main-presenter light direction, contrast, softness, and color mood; omit unrelated set-specific lighting";
  }
  return sanitizeReferenceWorldText(
    lighting,
    "copy the main-presenter light direction, contrast, softness, and color mood"
  );
}

function buildTransferableStyleOnlyWardrobe(brief: DirectorBrief, fullWardrobe: string) {
  if (!SUPPORTING_WARDROBE_PATTERN.test(fullWardrobe)) {
    return [
      "match the main presenter's outfit from the reference:",
      fullWardrobe,
      "adapt gendered garments to the avatar gender/body while keeping formality, color mood, and silhouette.",
      "face and body identity still come from the character_id/reference image.",
    ].filter(Boolean).join(" ");
  }
  const colors = brief.clothing.color_palette.length
    ? `colors: ${brief.clothing.color_palette.join(", ")}`
    : "";
  return [
    "match only the main presenter's outfit formality, silhouette, fit, and color mood from the reference;",
    colors,
    "omit uniforms, gloves, aprons, masks, or supporting-worker details.",
  ].filter(Boolean).join(" ");
}
