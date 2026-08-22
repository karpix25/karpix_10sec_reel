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
  segmentIndex: number,
  options?: { propagateCanonicalRepair?: boolean }
): StoryboardRepairMode {
  if (options?.propagateCanonicalRepair && segmentIndex > 1 && violations.some((violation) => violation.segmentIndex === 1)) {
    return "fresh";
  }
  return resolveStoryboardRepairMode(violations, segmentIndex);
}

export function canReuseStoryboardRepairReference(
  violations: readonly StoryboardSetViolation[],
  segmentIndex: number
) {
  return getStoryboardRepairMode(violations, segmentIndex) === "patch";
}
