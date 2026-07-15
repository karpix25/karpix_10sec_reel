import type { DirectorBrief } from "./director-analysis-types";
import type { ReferenceTransferPolicy } from "./omni-reference-transfer-policy";

export type DirectorSceneContract = {
  referenceLockLine: string;
  framingLine: string;
  sceneLine: string;
  cameraLightLine: string;
  wardrobeLine: string;
  editingLine: string;
  actionLine: string;
  propPassportLine: string;
};

export function buildDirectorSceneContract(
  brief: DirectorBrief | null,
  policy: ReferenceTransferPolicy = { mode: "full_reference", omitRawDirectorGuidance: false }
): DirectorSceneContract | null {
  if (!brief) return null;

  const wardrobe = [
    brief.clothing.style,
    brief.clothing.fit_details,
    brief.clothing.color_palette.length ? `colors: ${brief.clothing.color_palette.join(", ")}` : "",
  ].filter(Boolean).join("; ");
  const camera = [
    brief.camera.shot_types.join(", "),
    brief.camera.angles.length ? `angles: ${brief.camera.angles.join(", ")}` : "",
    brief.camera.movements.length ? `movement: ${brief.camera.movements.join(", ")}` : "",
    brief.camera.stabilization,
  ].filter(Boolean).join("; ");
  const editing = [
    brief.montage_rhythm.cut_pace,
    brief.montage_rhythm.beat_sync,
    brief.montage_rhythm.transition_style.length ? `transitions: ${brief.montage_rhythm.transition_style.join(", ")}` : "",
  ].filter(Boolean).join("; ");
  const actionDna = brief.action_beats
    .map((beat) => `${beat.timestamp_sec}s: ${beat.action_description}; ${beat.actor_gesture}`)
    .filter(Boolean)
    .join(" | ");
  const mechanics = [
    brief.reusable_mechanics.visual_mechanics.join("; "),
    brief.reusable_mechanics.looping_pattern ? `loop: ${brief.reusable_mechanics.looping_pattern}` : "",
  ].filter(Boolean).join("; ");

  if (policy.mode === "style_only") {
    return {
      referenceLockLine: [
        "REFERENCE LOCK:",
        "use the original reference only for transferable direction: presenter confidence, camera framing, camera movement, lighting feel, and edit rhythm.",
        "Do not copy unrelated B-roll locations, props, tools, hands-only process shots, uniforms from supporting workers, or another product category.",
        "Replace every product/process insert with the new product reference in a clean static cutaway.",
      ].join(" "),
      framingLine: [
        "REFERENCE FRAMING:",
        camera,
        "Keep the reference shot scale and stability, but point all insert shots at the new product instead of the original scene objects.",
      ].filter(Boolean).join(" "),
      sceneLine: [
        "REFERENCE SCENE:",
        "keep the main presenter setup and overall visual polish from the reference only when it supports this script.",
        "Do not recreate unrelated scene worlds, process props, work tools, supporting characters, or objects from another product category.",
      ].join(" "),
      cameraLightLine: [
        "REFERENCE CAMERA AND LIGHT:",
        camera,
        "match the reference lighting quality on the presenter; product inserts must use clean light that makes the new product image recognizable.",
      ].filter(Boolean).join(" "),
      wardrobeLine: [
        "REFERENCE WARDROBE:",
        "match only the main presenter's outfit formality, silhouette, and color mood from the reference;",
        "do not copy supporting-character outfit details, brand marks, or clothing from unrelated cutaways.",
      ].join(" "),
      editingLine: [
        "REFERENCE EDITING:",
        "match the reference pacing and transition feel at a high level.",
        "Use the same explain-and-show rhythm, but every insert must be relevant to the spoken script and the new product.",
      ].filter(Boolean).join(" "),
      actionLine: [
        "REFERENCE ACTION DNA:",
        "keep the reference pattern of presenter explanation plus short visual insert.",
        "Rewrite all unrelated process shots into calm product cutaways: the new product on a clean surface, visible packaging, stable framing, no extra hands unless needed for scale.",
        "Do not show another product, another workflow, or unrelated objects from the original reference.",
      ].join(" "),
      propPassportLine: [
        "REFERENCE SCENE PASSPORT:",
        "stable presenter background plus the new product only;",
        "the original reference product/process is not a prop source;",
        "when a cutaway appears, show the new product reference clearly on a clean surface.",
      ].join(" "),
    };
  }

  return {
    referenceLockLine: [
      "REFERENCE LOCK:",
      "match the original reference direction for wardrobe, lighting, camera framing, camera movement, edit rhythm, gestures, and environment.",
      "Only two changes are allowed: remove all subtitles/overlays/interface elements, and replace any original product or brand with the new product.",
    ].join(" "),
    framingLine: [
      "REFERENCE FRAMING:",
      camera,
      "Do not override this with generic full-body, medium-wide, handheld, or fast-cut instructions unless those are explicitly in the reference.",
    ].filter(Boolean).join(" "),
    sceneLine: [
      "REFERENCE SCENE:",
      brief.atmosphere.setting,
      `mood: ${brief.atmosphere.mood}`,
      `light: ${brief.atmosphere.lighting}`,
      `grade: ${brief.atmosphere.color_grading}`,
    ].filter(Boolean).join(" "),
    cameraLightLine: [
      "REFERENCE CAMERA AND LIGHT:",
      camera,
      `lighting must follow the reference: ${brief.atmosphere.lighting}`,
    ].filter(Boolean).join(" "),
    wardrobeLine: [
      "REFERENCE WARDROBE:",
      wardrobe,
      "match the reference outfit style, fit, color palette, and formality on the new character; face and body identity still come from the character_id/reference image.",
    ].filter(Boolean).join(" "),
    editingLine: [
      "REFERENCE EDITING:",
      editing,
      "match this edit rhythm and transition style; do not add extra fast cuts, subtitles, captions, or interface overlays.",
    ].filter(Boolean).join(" "),
    actionLine: [
      "REFERENCE ACTION DNA:",
      actionDna,
      mechanics,
      "adapt only the spoken script and product identity; keep gestures, posture, pacing, and camera mechanics from the reference.",
    ].filter(Boolean).join(" "),
    propPassportLine: [
      "REFERENCE SCENE PASSPORT:",
      "keep only stable background elements implied by the reference environment and the product when its role allows it;",
      "replace the original reference product with the new product when the product is visible;",
      "do not use preset household, travel, office, or gym props that are not part of this reference scene.",
    ].join(" "),
  };
}
