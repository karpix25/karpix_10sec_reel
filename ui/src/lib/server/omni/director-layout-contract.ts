import type { OmniContinuityProp, OmniSegmentCreativePlan } from "@/lib/omni/creative-contract";
import type { DirectorBrief } from "./director-analysis-types";
import type { ReferenceTransferPolicy } from "./omni-reference-transfer-policy";

export type DirectorLayoutContract = {
  id: "collage_picture_in_picture";
  layoutLine: string;
  cleanFrameLine: string;
  propPassportLine: string;
  actionLine: string;
  continuityProps: readonly OmniContinuityProp[];
};

const COLLAGE_PIP_PATTERN =
  /lower[-\s]?left|lower[-\s]?corner|corner framing|safe zones?.*lower|picture[-\s]?in[-\s]?picture|cutout|paper outline|white outline|speaker positioned.*corner|speaker.*corner|угл|вырез|обводк/iu;

export function buildDirectorLayoutContract(
  brief: DirectorBrief | null,
  policy: ReferenceTransferPolicy
): DirectorLayoutContract | null {
  if (!brief || policy.mode !== "full_reference" || !isCollagePictureInPictureReference(brief)) return null;
  const position = readObservedAvatarPosition(brief) || "lower-left corner";
  const backgroundDescription = "full-frame background follows the approved reference setting, light and camera; product shots are separate product-only B-roll without an avatar overlay";

  return {
    id: "collage_picture_in_picture",
    layoutLine: [
      "REFERENCE LAYOUT: COLLAGE PICTURE-IN-PICTURE.",
      `In presenter panels preserve the reference composition: full-frame background video and the main avatar as a cutout at ${position}; follow a panel's observed position when it differs.`,
      "Preserve the observed cutout size and edge treatment; do not invent an outline.",
      "In product B-roll panels show only the product, without people, hands or an avatar overlay. Return to the presenter by a separate cut.",
    ].join(" "),
    cleanFrameLine: [
      "CLEAN FRAME:",
      "no subtitles, captions, app UI, buttons, watermarks, logos, or generated social-media overlays.",
      "Preserve a cutout outline only when it is visible in the reference; it belongs to presenter panels only.",
    ].join(" "),
    propPassportLine: [
      "REFERENCE SCENE PASSPORT:",
      "collage/PIP layout stays consistent in presenter panels;",
      `presenter position ${position}; absent in product B-roll;`,
      `${backgroundDescription};`,
      "keep the reference setting and light; product B-roll may use a stable support in that setting.",
    ].join(" "),
    actionLine: [
      "REFERENCE ACTION DNA:",
      `In presenter panels the saved avatar speaks from ${position} over approved thematic background visuals.`,
      "Adapt product demonstrations to separate product-only shots on a stable surface, without hands or avatar layers; the same speech continues off-camera.",
      "Show products only in approved product intervals. Preserve the observed layout when the avatar returns.",
    ].join(" "),
    continuityProps: [
      {
        name: "collage avatar cutout",
        appearance: "saved avatar speaking to camera in presenter panels; absent from product B-roll panels",
        initialPosition: position,
      },
      {
        name: "reference-matched background B-roll",
        appearance: backgroundDescription,
        initialPosition: "fills the vertical frame; avatar layer appears only in assigned presenter panels",
      },
    ],
  };
}

export function isCollagePictureInPictureReference(brief: DirectorBrief | null) {
  if (!brief) return false;
  return COLLAGE_PIP_PATTERN.test(getDirectorLayoutText(brief));
}

export function applyDirectorLayoutToPlan(
  plan: OmniSegmentCreativePlan,
  layout: DirectorLayoutContract | null
): OmniSegmentCreativePlan {
  if (!layout) return plan;
  return {
    ...plan,
    continuityProps: layout.continuityProps,
  };
}

function getDirectorLayoutText(brief: DirectorBrief) {
  return [
    brief.visual_hook.action,
    brief.visual_hook.retention_trigger,
    brief.atmosphere.setting,
    brief.atmosphere.lighting,
    ...brief.camera.shot_types,
    ...(brief.camera_timeline || []).map((item) => item.composition),
    ...brief.action_beats.flatMap((beat) => [beat.action_description, beat.actor_gesture]),
    ...brief.reusable_mechanics.visual_mechanics,
    brief.reusable_mechanics.safe_zones_for_elements,
    brief.reusable_mechanics.looping_pattern,
  ].filter(Boolean).join(" ");
}

function readObservedAvatarPosition(brief: DirectorBrief) {
  const layoutText = [brief.reusable_mechanics.safe_zones_for_elements, getDirectorLayoutText(brief)].join(" ");
  const corner = layoutText.match(/(?:lower|upper|top|bottom)[ -](?:left|right|center)(?:[ -](?:corner|quadrant))?/iu)?.[0];
  if (corner) return corner;
  const russianCorner = layoutText.match(/(?:в\s+)?(?:(?:лев[а-яё]*|прав[а-яё]*)\s+(?:нижн[а-яё]*|верхн[а-яё]*)|(?:нижн[а-яё]*|верхн[а-яё]*)\s+(?:лев[а-яё]*|прав[а-яё]*))\s+угл[а-яё]*/iu)?.[0];
  return russianCorner || brief.reusable_mechanics.safe_zones_for_elements.match(/\b(?:left|right|center)(?: side)?\b|(?:в центре|по центру)/iu)?.[0] || null;
}
