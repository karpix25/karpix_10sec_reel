import { createHash } from "crypto";
import type { OmniStoryboardSegment } from "../../omni/storyboard/omni-storyboard-types";
import type { ProductRole } from "../../omni/creative-contract";
import type { ReferenceSegmentPlan } from "./reference-segment-plan";

export function buildStoryboardPlanSignature(
  promptPlan: readonly {
    index: number;
    storyboardPlan: OmniStoryboardSegment | null;
    productRole?: ProductRole;
    referenceSegmentPlan?: ReferenceSegmentPlan | null;
  }[]
) {
  return createHash("sha256")
    .update(JSON.stringify(promptPlan.map((segment) => ({
      index: segment.index,
      storyboardPlan: segment.storyboardPlan,
      productRole: segment.productRole || null,
      referenceSegmentPlan: segment.referenceSegmentPlan || null,
    }))))
    .digest("hex");
}
