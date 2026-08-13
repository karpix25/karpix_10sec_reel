import type {
  StoryboardVisionPanel,
  StoryboardVisionStatus,
  StoryboardVisionValidation,
  StoryboardVisionViolation,
} from "../../omni/storyboard/omni-storyboard-vision-types";

export const STORYBOARD_VISION_MIN_CONFIDENCE = 0.65;

export function normalizeStoryboardVisionValidation(value: unknown, model?: string): StoryboardVisionValidation {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const confidence = clampNumber(source.confidence, 0);
  const panels = Array.isArray(source.panels) ? source.panels.map(normalizePanel).filter(Boolean) as StoryboardVisionPanel[] : [];
  const repairInstructionSource = Array.isArray(source.repair_instructions)
    ? source.repair_instructions
    : typeof source.repair_instructions === "string" ? [source.repair_instructions] : [];
  const repairInstructions = repairInstructionSource
    .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .map((item) => item.trim());
  const hasBlockingPanel = panels.some((panel) => panel.status === "block");
  const hasRepairPanel = panels.some((panel) => panel.status === "repair" && panel.violations.some((violation) => violation.severity === "error"));
  const hasRepair = hasRepairPanel || repairInstructions.length > 0;
  const status: StoryboardVisionStatus = confidence < STORYBOARD_VISION_MIN_CONFIDENCE || hasBlockingPanel
    ? "block"
    : hasRepair
      ? "repair"
      : panels.length > 0 ? "pass" : "block";
  return { schemaVersion: "storyboard_vision_v1", status, confidence, panels, repairInstructions, model };
}

export function isStoryboardVisionValidationInconclusive(validation: StoryboardVisionValidation) {
  return validation.status === "block"
    && !validation.repairInstructions.length
    && !validation.panels.some((panel) => panel.violations.some(isActionableViolation));
}

export function getStoryboardVisionRepairInstructions(validation: StoryboardVisionValidation) {
  const instructions = [
    ...validation.repairInstructions,
    ...validation.panels.flatMap((panel) =>
      panel.violations
        .filter(isActionableViolation)
        .map((violation) => `Panel ${panel.panelIndex}: ${violation.code} — ${violation.evidence}`)
    ),
  ];
  return [...new Set(instructions.map((instruction) => instruction.trim()).filter(Boolean))];
}

function normalizePanel(value: unknown): StoryboardVisionPanel | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const panelIndex = Number(source.panel_index ?? source.panelIndex);
  if (!Number.isInteger(panelIndex) || panelIndex < 1) return null;
  const violations = Array.isArray(source.violations)
    ? source.violations.map(normalizeViolation).filter(Boolean) as StoryboardVisionViolation[]
    : [];
  return { panelIndex, status: normalizeStatus(source.status) || (violations.length ? "repair" : "pass"), violations };
}

function normalizeViolation(value: unknown): StoryboardVisionViolation | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  return {
    code: typeof source.code === "string" ? source.code.trim() : "UNKNOWN_PHYSICAL_VIOLATION",
    evidence: typeof source.evidence === "string" ? source.evidence.trim() : "No evidence provided",
    severity: source.severity === "warning" ? "warning" : "error",
  };
}

function normalizeStatus(value: unknown): StoryboardVisionStatus | null {
  return value === "pass" || value === "repair" || value === "block" ? value : null;
}

function clampNumber(value: unknown, fallback: number) {
  const number = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() ? Number(value) : fallback;
  if (!Number.isFinite(number)) return fallback;
  return Math.min(1, Math.max(0, number));
}

function isActionableViolation(violation: StoryboardVisionViolation) {
  return violation.code !== "UNKNOWN_PHYSICAL_VIOLATION" && violation.evidence !== "No evidence provided";
}
