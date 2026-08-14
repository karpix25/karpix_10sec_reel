type StoryboardSetViolation = {
  segmentIndex: number;
  code: string;
};

const IDENTITY_REPAIR_CODES = /identity|gender|hair|body/iu;

export function canReuseStoryboardRepairReference(
  violations: readonly StoryboardSetViolation[],
  segmentIndex: number
) {
  return !violations.some((violation) =>
    violation.segmentIndex === segmentIndex && IDENTITY_REPAIR_CODES.test(violation.code)
  );
}
