export type StoryboardQaViolation = {
  code: string;
  severity: "error" | "warning";
  evidence: string;
};

export type StoryboardRepairMode = "fresh" | "patch" | "metadata_only";

const METADATA_ONLY_CODES = /(?:reference_(?:action|composition|camera)|camera(?:_|$)|composition|frame_?action|gesture|motion|timing|teleportation|face_?gesture|physical_?action|wardrobe|outfit|garment|sleeve|neckline|fabric|environment|lighting|room|location|background|mouth|lip)/iu;
const SYSTEMIC_DRIFT_CODES = /(?:featured_identity_mismatch|identity_mismatch|wrong_(?:featured_)?(?:person|avatar)|gross_visual_corruption)/iu;
const SOURCE_INTERVAL_CODES = /(?:storyboard_source_presenter_environment_cutaway|storyboard_source_avatar_forbidden_face|storyboard_source_broll_presenter|storyboard_product_cutaway_without_product_intent)/iu;
const BLOCKING_VISUAL_CODES = /(?:featured_identity_mismatch|identity_mismatch|wrong_(?:featured_)?(?:person|avatar)|product_(?:form|packaging)_mismatch|product_missing|foreign_product|gross_visual_corruption|presenter_wardrobe_continuity_mismatch|storyboard_source_presenter_environment_cutaway|storyboard_source_avatar_forbidden_face|storyboard_source_broll_presenter|storyboard_product_cutaway_without_product_intent)/iu;
const PRESENTER_WARDROBE_CONTINUITY_CODE = /^presenter_wardrobe_continuity_mismatch$/iu;
const STATIC_PHYSICS_CODES = /^(?:product_support_missing|product_scale_mismatch|product_broll_has_human_interaction|object_interpenetration)$/iu;
const OFFSCREEN_EVIDENCE = /(?:not visible|outside (?:the )?crop|offscreen|cropped(?: out)?|cannot (?:see|verify|tell)|unclear|not enough (?:detail|evidence)|не видно|вне кадра|обрезан|не удается (?:увидеть|проверить)|недостаточно (?:деталей|данных))/iu;

export const STORYBOARD_STATIC_PHYSICS_QA_PROMPT = [
  "Also inspect static physical defects in every planned product panel. The following additional error codes are allowed only with positive visible evidence in a named panel:",
  "PRODUCT_SUPPORT_MISSING: a stationary product visibly floats above its planned support with a clear air gap. A cropped base, a hidden support, or a missing contact shadow alone is not evidence.",
  "OBJECT_INTERPENETRATION: visibly solid objects or a product and its support intersect through each other in physically impossible geometry. Ordinary occlusion or overlap in a flat image is not evidence.",
  "PRODUCT_SCALE_MISMATCH: the product has a clearly impossible size relative to a known object on the same depth plane or explicit plan dimensions. Do not compare apparent pixel size across camera angles, close-ups, or separate panels.",
  "PRODUCT_BROLL_HAS_HUMAN_INTERACTION: a planned product panel visibly includes a person, body part, or hand, including holding or touching the product. All client-product panels are standalone object-only B-roll on stable support; the avatar speaks in separate product-free panels. People allowed in thematic B-roll do not waive this product-panel rule.",
  "Use the adapted physical_plan, product_placement, and visual_action as the panel contract. Source-reference actions do not override the product-only contract.",
  "Static panels cannot prove temporal physics, lip-sync, speed, or teleportation. Montage cuts may change viewpoint or location and switch between avatar and B-roll; never report these as physical defects. Do not request video analysis.",
  "Use warning or omit the issue when evidence is uncertain, hidden, cropped, or absent. Preserve the approved composition and fix only the visibly defective panel.",
].join(" ");

export function normalizeStoryboardQaViolation<T extends StoryboardQaViolation>(violation: T): T {
  return {
    ...violation,
    severity: isBlockingStoryboardQaViolation(violation) ? "error" : "warning",
  };
}

export function isStoryboardQaMetadataOnly(violation: Pick<StoryboardQaViolation, "code">) {
  return !PRESENTER_WARDROBE_CONTINUITY_CODE.test(violation.code) &&
    !isSourceIntervalViolation(violation.code) &&
    METADATA_ONLY_CODES.test(violation.code);
}

export function isBlockingStoryboardQaViolation(violation: StoryboardQaViolation) {
  const sourceIntervalViolation = isSourceIntervalViolation(violation.code);
  if ((!sourceIntervalViolation && violation.severity !== "error") || isStoryboardQaMetadataOnly(violation)) return false;
  const staticPhysicsViolation = STATIC_PHYSICS_CODES.test(violation.code);
  if (!BLOCKING_VISUAL_CODES.test(violation.code) && !staticPhysicsViolation) return false;
  if (staticPhysicsViolation && (!violation.evidence.trim() || /^no evidence provided$/iu.test(violation.evidence))) return false;
  if (OFFSCREEN_EVIDENCE.test(violation.evidence) && !isProductViolation(violation.code) && !sourceIntervalViolation) return false;
  return true;
}

export function resolveStoryboardRepairMode(
  violations: readonly (Pick<StoryboardQaViolation, "code"> & { segmentIndex?: number })[],
  segmentIndex?: number
): StoryboardRepairMode {
  const targeted = violations.filter((violation) => !segmentIndex || violation.segmentIndex === segmentIndex);
  if (!targeted.length || targeted.every(isStoryboardQaMetadataOnly)) return "metadata_only";
  return targeted.some((violation) => SYSTEMIC_DRIFT_CODES.test(violation.code)) ? "fresh" : "patch";
}

function isProductViolation(code: string) {
  return /(?:product_(?:form|packaging)_mismatch|product_missing|foreign_product)/iu.test(code);
}

function isSourceIntervalViolation(code: string) {
  return SOURCE_INTERVAL_CODES.test(code);
}
