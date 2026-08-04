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
