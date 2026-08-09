import type {
  StoryboardVisionPanel,
  StoryboardVisionStatus,
  StoryboardVisionValidation,
  StoryboardVisionViolation,
} from "../../omni/storyboard/omni-storyboard-vision-types";

export const STORYBOARD_VISION_MIN_CONFIDENCE = 0.85;

export function normalizeStoryboardVisionValidation(value: unknown, model?: string): StoryboardVisionValidation {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const confidence = clampNumber(source.confidence, 0);
  const panels = Array.isArray(source.panels) ? source.panels.map(normalizePanel).filter(Boolean) as StoryboardVisionPanel[] : [];
  const repairInstructions = Array.isArray(source.repair_instructions)
    ? source.repair_instructions
      .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
      .map((item) => item.trim())
    : [];
  const requestedStatus = normalizeStatus(source.status);
  const hasBlockingPanel = panels.some((panel) => panel.status === "block");
  const hasRepairPanel = panels.some((panel) => panel.status === "repair");
  const allPanelsPass = panels.length > 0 && panels.every((panel) => panel.status === "pass");
  const status: StoryboardVisionStatus = confidence < STORYBOARD_VISION_MIN_CONFIDENCE || hasBlockingPanel
    ? "block"
    : hasRepairPanel || (allPanelsPass && repairInstructions.length > 0)
      ? "repair"
      : allPanelsPass ? "pass"
        : requestedStatus === "repair" ? "repair" : "block";
  return { schemaVersion: "storyboard_vision_v1", status, confidence, panels, repairInstructions, model };
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
  const number = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(1, Math.max(0, number));
}
