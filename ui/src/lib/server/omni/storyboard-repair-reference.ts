import {
  resolveStoryboardRepairMode,
  type StoryboardRepairMode,
} from "./storyboard-qa-contract";

type StoryboardSetViolation = {
  segmentIndex: number;
  code: string;
};

export function getStoryboardRepairMode(
  violations: readonly StoryboardSetViolation[],
  segmentIndex: number
): StoryboardRepairMode {
  return resolveStoryboardRepairMode(violations, segmentIndex);
}

export function canReuseStoryboardRepairReference(
  violations: readonly StoryboardSetViolation[],
  segmentIndex: number
) {
  return getStoryboardRepairMode(violations, segmentIndex) === "patch";
}
