export type StoryboardQaViolation = {
  code: string;
  severity: "error" | "warning";
  evidence: string;
};

export type StoryboardRepairMode = "fresh" | "patch" | "metadata_only";

const METADATA_ONLY_CODES = /(?:reference_(?:action|composition|camera)|camera(?:_|$)|composition|frame_?action|gesture|motion|timing|teleportation|face_?gesture|physical_?action|wardrobe|outfit|garment|sleeve|neckline|fabric|environment|lighting|room|location|background|mouth|lip)/iu;
const SYSTEMIC_DRIFT_CODES = /(?:featured_identity_mismatch|identity_mismatch|wrong_(?:featured_)?(?:person|avatar)|gross_visual_corruption)/iu;
const BLOCKING_VISUAL_CODES = /(?:featured_identity_mismatch|identity_mismatch|wrong_(?:featured_)?(?:person|avatar)|product_(?:form|packaging)_mismatch|product_missing|foreign_product|gross_visual_corruption)/iu;
const OFFSCREEN_EVIDENCE = /(?:not visible|outside (?:the )?crop|offscreen|cropped(?: out)?|cannot (?:see|verify|tell)|unclear|not enough (?:detail|evidence)|не видно|вне кадра|обрезан|не удается (?:увидеть|проверить)|недостаточно (?:деталей|данных))/iu;

export function normalizeStoryboardQaViolation<T extends StoryboardQaViolation>(violation: T): T {
  return {
    ...violation,
    severity: isBlockingStoryboardQaViolation(violation) ? "error" : "warning",
  };
}

export function isStoryboardQaMetadataOnly(violation: Pick<StoryboardQaViolation, "code">) {
  return METADATA_ONLY_CODES.test(violation.code);
}

export function isBlockingStoryboardQaViolation(violation: StoryboardQaViolation) {
  if (violation.severity !== "error" || isStoryboardQaMetadataOnly(violation)) return false;
  if (!BLOCKING_VISUAL_CODES.test(violation.code)) return false;
  if (OFFSCREEN_EVIDENCE.test(violation.evidence) && !isProductViolation(violation.code)) return false;
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
