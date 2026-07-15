import type { DirectorBrief } from "./director-analysis-types";

export type DirectorSceneContract = {
  sceneLine: string;
  cameraLightLine: string;
  wardrobeLine: string;
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

  return {
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
      "reference-derived wardrobe for the new character:",
      wardrobe,
      "face and body identity still come from the character_id/reference image; outfit follows this reference direction.",
    ].filter(Boolean).join(" "),
    propPassportLine: [
      "REFERENCE SCENE PASSPORT:",
      "keep only stable background elements implied by the reference environment and the product when its role allows it;",
      "do not use preset household, travel, office, or gym props that are not part of this reference scene.",
    ].join(" "),
  };
}
