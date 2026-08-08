const MAX_OMNI_SEGMENT_RETRIES = 2;

export function getOmniSegmentRetryCount(payload?: Record<string, unknown> | null) {
  const value = Number(payload?.omni_retry_count || 0);
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

export function canRetryOmniSegment(payload?: Record<string, unknown> | null) {
  return getOmniSegmentRetryCount(payload) < MAX_OMNI_SEGMENT_RETRIES;
}

export function buildOmniSegmentRetryPayload(
  payload: Record<string, unknown> | null | undefined,
  reason: string
) {
  return {
    ...(payload || {}),
    omni_retry_count: getOmniSegmentRetryCount(payload) + 1,
    omni_retry_reason: reason.slice(0, 500),
  };
}

export function appendOmniSegmentRetryPrompt(
  prompt: string,
  payload?: Record<string, unknown> | null
) {
  const reason = typeof payload?.omni_retry_reason === "string"
    ? payload.omni_retry_reason.replace(/\s+/g, " ").trim().slice(0, 500)
    : "";
  if (!reason) return prompt;
  return [
    prompt,
    `OUTPUT QA REPAIR: Previous generation was rejected because: ${reason}`,
    "Regenerate the same approved scene and exact voiceover. Fix only the rejected output; do not add, remove, repeat, or paraphrase speech.",
  ].join("\n");
}
