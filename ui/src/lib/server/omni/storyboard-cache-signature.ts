import { createHash } from "crypto";
import type { OmniStoryboardSegment } from "../../omni/storyboard/omni-storyboard-types";

export function buildStoryboardPlanSignature(
  promptPlan: readonly { index: number; storyboardPlan: OmniStoryboardSegment | null }[]
) {
  return createHash("sha256")
    .update(JSON.stringify(promptPlan.map((segment) => ({
      index: segment.index,
      storyboardPlan: segment.storyboardPlan,
    }))))
    .digest("hex");
}
