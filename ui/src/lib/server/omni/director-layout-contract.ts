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
      "full-frame background layer shows the new product reference and relevant science/skin visuals instead of the original product;",
      "do not replace this with a room, table, corridor, sofa, or generic studio wall.",
    ].join(" "),
    actionLine: [
      "REFERENCE ACTION DNA:",
      "presenter remains a lower-left cutout speaking to camera while the background layer changes behind them.",
      "Replace the original background product with the new product reference from the first relevant frame.",
      "Use product/science/skin visual backgrounds tied to the spoken point; do not turn the layout into a normal centered talking-head shot.",
    ].join(" "),
    continuityProps: [
      {
        name: "collage avatar cutout",
        appearance: "main character in lower-left corner with thick white paper outline, speaking to camera",
        initialPosition: "fixed in the lower-left safe zone for the whole segment",
      },
      {
        name: "dynamic product-science background",
        appearance: "full-frame background layer with the new product reference and relevant science/skin visuals",
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
  const productRole = layout.requiresOpeningProductBackground && plan.productRole === "hidden"
    ? "background_prop"
    : plan.productRole;
  return {
    ...plan,
    productRole,
    continuityProps: layout.continuityProps,
    beats: plan.beats.map((beat, index) => ({
      ...beat,
      action: buildCollageBeatAction(index, beat.action, layout.requiresOpeningProductBackground),
    })) as unknown as OmniSegmentCreativePlan["beats"],
  };
}

function buildCollageBeatAction(index: number, originalAction: string, showProductBackground: boolean) {
  const cue = extractScenarioCue(originalAction);
  const productLayer = showProductBackground
    ? "background layer prominently uses the new product reference plus relevant science/skin visuals"
    : "background layer uses relevant science/skin visuals without unrelated props";
  const base = [
    index === 0
      ? `collage/PIP opening frame with montage перебивка logic: ${productLayer}; main avatar is a lower-left cutout with thick white paper outline, speaking to camera`
      : index === 1
        ? `collage/PIP background перебивка changes behind the same lower-left cutout avatar: ${productLayer}`
        : `collage/PIP return frame after перебивка: lower-left cutout avatar stays fixed with white paper outline while ${productLayer}`,
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
