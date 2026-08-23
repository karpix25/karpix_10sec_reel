import { createHash } from "crypto";
import type { OmniStoryboardSegment } from "../../omni/storyboard/omni-storyboard-types";
import type { ReferenceSegmentPlan } from "./reference-segment-plan";

export function buildStoryboardPlanSignature(
  promptPlan: readonly {
    index: number;
    storyboardPlan: OmniStoryboardSegment | null;
    referenceSegmentPlan?: ReferenceSegmentPlan | null;
  }[]
) {
  return createHash("sha256")
    .update(JSON.stringify(promptPlan.map((segment) => ({
      index: segment.index,
      storyboardPlan: segment.storyboardPlan,
      referenceSegmentPlan: segment.referenceSegmentPlan || null,
    }))))
    .digest("hex");
}
