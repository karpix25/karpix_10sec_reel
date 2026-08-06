export type StoryboardVisionStatus = "pass" | "repair" | "block";

export type StoryboardVisionViolation = {
  code: string;
  severity: "error" | "warning";
  evidence: string;
};

export type StoryboardVisionPanel = {
  panelIndex: number;
  status: StoryboardVisionStatus;
  violations: readonly StoryboardVisionViolation[];
};

export type StoryboardVisionValidation = {
  schemaVersion: "storyboard_vision_v1";
  status: StoryboardVisionStatus;
  confidence: number;
  panels: readonly StoryboardVisionPanel[];
  repairInstructions: readonly string[];
  model?: string;
};
