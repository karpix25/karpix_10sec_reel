const MAX_OMNI_SEGMENT_RETRIES = 2;

export function getOmniSegmentRetryCount(payload?: Record<string, unknown> | null) {
  const value = Number(payload?.omni_retry_count || 0);
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

export function canRetryOmniSegment(payload?: Record<string, unknown> | null) {
  return getOmniSegmentRetryCount(payload) < MAX_OMNI_SEGMENT_RETRIES;
}

export function hasKieSafetyStoryboardRepair(payload?: Record<string, unknown> | null) {
  return payload?.omni_kie_safety_storyboard_repaired === true;
}

export function buildOmniSegmentRetryPayload(
  payload: Record<string, unknown> | null | undefined,
  reason: string,
  options?: { safetyStoryboardRepaired?: boolean; continuityRepairInstructions?: readonly string[] }
) {
  return {
    ...(payload || {}),
    omni_retry_count: getOmniSegmentRetryCount(payload) + 1,
    omni_retry_reason: reason.slice(0, 500),
    ...(options?.safetyStoryboardRepaired ? { omni_kie_safety_storyboard_repaired: true } : {}),
    ...(options?.continuityRepairInstructions?.length
      ? { omni_continuity_repair_instructions: [...new Set(options.continuityRepairInstructions)].slice(0, 8) }
      : {}),
  };
}

export function getOmniSegmentContinuityRepairInstructions(payload?: Record<string, unknown> | null) {
  const source = payload?.omni_continuity_repair_instructions;
  return Array.isArray(source)
    ? source.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim())
    : [];
}
