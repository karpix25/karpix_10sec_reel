import type { OmniContinuityProp, OmniSegmentCreativePlan } from "@/lib/omni/creative-contract";
import type { DirectorBrief } from "./director-analysis-types";
import type { ReferenceTransferPolicy } from "./omni-reference-transfer-policy";

export type DirectorLayoutContract = {
  id: "collage_picture_in_picture";
  layoutLine: string;
  cleanFrameLine: string;
  propPassportLine: string;
  actionLine: string;
  requiresOpeningProductBackground: boolean;
  continuityProps: readonly OmniContinuityProp[];
};

const COLLAGE_PIP_PATTERN =
  /lower[-\s]?left|lower[-\s]?corner|corner framing|safe zones?.*lower|picture[-\s]?in[-\s]?picture|cutout|paper outline|white outline|speaker positioned.*corner|speaker.*corner|угл|вырез|обводк/iu;

const PRODUCT_SCIENCE_BACKGROUND_PATTERN =
  /background (?:rapidly )?(?:cycles|shifts|changes)|background visuals|macro product|product close[-\s]?up|product container|collagen|supplement|skin tissue|skin layers|scientific|lab|3d animation|digital environment|glowing/iu;

export function buildDirectorLayoutContract(
  brief: DirectorBrief | null,
  policy: ReferenceTransferPolicy
): DirectorLayoutContract | null {
  if (!brief || policy.mode !== "full_reference" || !isCollagePictureInPictureReference(brief)) return null;
  const hasProductBackground = referenceUsesProductOrScienceBackground(brief);
  const backgroundDescription = hasProductBackground
    ? "full-frame background layer shows the new product reference and relevant product visuals instead of the original product"
    : "full-frame background layer follows the reference location, action, and camera; replace only a source product when the director analysis marks one";

  return {
    id: "collage_picture_in_picture",
    requiresOpeningProductBackground: hasProductBackground,
    layoutLine: [
      "REFERENCE LAYOUT: COLLAGE PICTURE-IN-PICTURE.",
      "Preserve the reference composition: full-frame background video layer behind the presenter, and the main avatar as a cutout/sticker in the lower-left corner.",
      "The cutout has a thick white paper outline around the person, like a pasted collage element.",
      "Keep the avatar in the lower-left safe zone while the background remains visible across the upper and right areas.",
    ].join(" "),
    cleanFrameLine: [
      "CLEAN FRAME:",
      "no subtitles, captions, app UI, buttons, watermarks, logos, or generated social-media overlays.",
      "The only allowed graphic treatment is the reference-style thick white paper outline around the cutout avatar; it is part of the collage layout, not a subtitle or interface element.",
    ].join(" "),
    propPassportLine: [
      "REFERENCE SCENE PASSPORT:",
      "collage/PIP layout stays fixed;",
      "lower-left presenter cutout with thick white paper outline stays fixed;",
      `${backgroundDescription};`,
      "do not replace the reference background with unrelated science, skin, room, table, corridor, sofa, or generic studio visuals.",
    ].join(" "),
    actionLine: [
      "REFERENCE ACTION DNA:",
      "presenter remains a lower-left cutout speaking to camera while the background layer changes behind them.",
      hasProductBackground
        ? "Replace the original background product with the new product reference from the first relevant frame."
        : "Keep the reference background subject and visual action; do not invent a product-science or skin visual layer.",
      "Use only background visuals tied to the spoken point; do not turn the layout into a normal centered talking-head shot.",
    ].join(" "),
    continuityProps: [
      {
        name: "collage avatar cutout",
        appearance: "main character in lower-left corner with thick white paper outline, speaking to camera",
        initialPosition: "fixed in the lower-left safe zone for the whole segment",
      },
      {
        name: hasProductBackground ? "dynamic product background" : "reference-matched background B-roll",
        appearance: backgroundDescription,
        initialPosition: "behind the cutout avatar, filling the vertical frame",
      },
    ],
  };
}

export function isCollagePictureInPictureReference(brief: DirectorBrief | null) {
  if (!brief) return false;
  return COLLAGE_PIP_PATTERN.test(getDirectorLayoutText(brief));
}

export function referenceUsesProductOrScienceBackground(brief: DirectorBrief | null) {
  if (!brief) return false;
  return PRODUCT_SCIENCE_BACKGROUND_PATTERN.test(getDirectorLayoutText(brief));
}

export function applyDirectorLayoutToPlan(
  plan: OmniSegmentCreativePlan,
  layout: DirectorLayoutContract | null
): OmniSegmentCreativePlan {
  if (!layout) return plan;
  const showProductBackground = layout.requiresOpeningProductBackground && plan.productRole !== "hidden";
  return {
    ...plan,
    continuityProps: layout.continuityProps,
    beats: plan.beats.map((beat, index) => ({
      ...beat,
      action: buildCollageBeatAction(index, beat.action, showProductBackground, layout.requiresOpeningProductBackground),
    })) as unknown as OmniSegmentCreativePlan["beats"],
  };
}

function buildCollageBeatAction(
  index: number,
  originalAction: string,
  showProductBackground: boolean,
  hasProductBackground: boolean,
) {
  const cue = extractScenarioCue(originalAction);
  const productLayer = showProductBackground
    ? hasProductBackground
      ? "full-frame background layer uses the new product reference and relevant product visuals"
      : "full-frame background layer follows the reference action and location"
    : hasProductBackground
      ? "full-frame background layer uses relevant product visuals without unrelated props"
      : "full-frame background layer follows the reference action and location without unrelated props";
  const base = [
    index === 0
      ? `REFERENCE LAYOUT: COLLAGE PICTURE-IN-PICTURE; lower-left corner cutout avatar with thick white paper outline; collage/PIP opening frame; ${productLayer}`
      : index === 1
        ? `collage/PIP background перебивка behind the same lower-left cutout avatar; ${productLayer}`
        : `collage/PIP return frame: lower-left cutout avatar stays fixed with white paper outline; ${productLayer}`,
    "no centered full-screen presenter shot, no generic room, no table cutaway, no subtitles",
  ].join("; ");
  return cue ? `${base}. ${cue}` : base;
}

function extractScenarioCue(action: string) {
  const marker = "Сценарный visual cue:";
  const index = action.indexOf(marker);
  return index >= 0 ? action.slice(index).trim() : "";
}

function getDirectorLayoutText(brief: DirectorBrief) {
  return [
    brief.visual_hook.action,
    brief.visual_hook.retention_trigger,
    brief.atmosphere.setting,
    brief.atmosphere.lighting,
    ...brief.camera.shot_types,
    ...brief.action_beats.flatMap((beat) => [beat.action_description, beat.actor_gesture]),
    ...brief.reusable_mechanics.visual_mechanics,
    brief.reusable_mechanics.safe_zones_for_elements,
    brief.reusable_mechanics.looping_pattern,
  ].filter(Boolean).join(" ");
}
