import type { StoryboardVisionStatus, StoryboardVisionViolation } from "./omni-storyboard-vision-types";

export type StoryboardSetVisionViolation = StoryboardVisionViolation & {
  segmentIndex: number;
  panels: readonly number[];
};

export type StoryboardSetVisionValidation = {
  schemaVersion: "storyboard_set_vision_v1";
  status: StoryboardVisionStatus;
  confidence: number;
  canonicalIdentity: string;
  violations: readonly StoryboardSetVisionViolation[];
  repairInstructions: readonly string[];
  model?: string;
};

export type StoryboardSetQualityRecord = {
  policyVersion?: string;
  validation: StoryboardSetVisionValidation;
  storyboardUrls: readonly { segmentIndex: number; url: string }[];
  attemptCount: number;
  checkedAt: string;
};
