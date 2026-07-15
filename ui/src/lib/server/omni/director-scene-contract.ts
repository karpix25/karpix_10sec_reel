import type { DirectorBrief } from "./director-analysis-types";

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

export function buildDirectorSceneContract(brief: DirectorBrief | null): DirectorSceneContract | null {
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
