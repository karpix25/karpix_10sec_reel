import type { OmniReelSegment } from "@/lib/omni/types";

export function buildOmniReelFailureMessage(segments: readonly OmniReelSegment[]) {
  const details = segments
    .filter((segment) => segment.status === "failed")
    .map((segment) => `segment ${segment.segment_index}: ${shorten(segment.error_message || "Omni segment failed")}`)
    .join("; ");
  return shorten(details || "One or more segments failed");
}

function shorten(value: string) {
  return value.replace(/\s+/gu, " ").trim().slice(0, 2000);
}
