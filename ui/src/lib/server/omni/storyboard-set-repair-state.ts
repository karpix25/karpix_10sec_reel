import type { StoryboardSetVisionValidation } from "@/lib/omni/storyboard/omni-storyboard-set-vision-types";

export const STORYBOARD_SET_REPAIR_STATE_VERSION = "storyboard_set_repair_v1" as const;

export type StoryboardSetRepairSnapshot = {
  segmentIndex: number;
  url: string;
};

export type StoryboardSetRepairState = {
  schemaVersion: typeof STORYBOARD_SET_REPAIR_STATE_VERSION;
  referenceSignature: string;
  qaRound: number;
  status: "repairing" | "awaiting_qa";
  snapshot: readonly StoryboardSetRepairSnapshot[];
  targetSegments: readonly number[];
  cursor: number;
  validation: StoryboardSetVisionValidation;
  startedAt: string;
};

export type StoryboardSetRepairProgress = Pick<StoryboardSetRepairState, "qaRound" | "cursor"> & {
  segmentIndex: number;
};

export function createStoryboardSetRepairState(input: {
  referenceSignature: string;
  qaRound: number;
  snapshot: readonly StoryboardSetRepairSnapshot[];
  targetSegments: readonly number[];
  validation: StoryboardSetVisionValidation;
}) : StoryboardSetRepairState {
  return {
    schemaVersion: STORYBOARD_SET_REPAIR_STATE_VERSION,
    referenceSignature: input.referenceSignature,
    qaRound: Math.max(1, Math.floor(input.qaRound)),
    status: "repairing",
    snapshot: normalizeSnapshot(input.snapshot),
    targetSegments: normalizeSegmentIndexes(input.targetSegments),
    cursor: 0,
    validation: input.validation,
    startedAt: new Date().toISOString(),
  };
}

export function getStoryboardSetRepairProgress(state: StoryboardSetRepairState): StoryboardSetRepairProgress | null {
  if (state.status !== "repairing") return null;
  const segmentIndex = state.targetSegments[state.cursor];
  return Number.isInteger(segmentIndex)
    ? { qaRound: state.qaRound, cursor: state.cursor, segmentIndex }
    : null;
}

export function getStoryboardSetRepairSnapshotUrls(
  state: StoryboardSetRepairState | null,
  referenceSignature: string
) {
  if (!state || state.referenceSignature !== referenceSignature) return new Map<number, string>();
  return new Map(state.snapshot.map((item) => [item.segmentIndex, item.url]));
}

export function advanceStoryboardSetRepairState(
  state: StoryboardSetRepairState,
  progress: StoryboardSetRepairProgress
): StoryboardSetRepairState {
  const current = getStoryboardSetRepairProgress(state);
  if (!current || current.qaRound !== progress.qaRound || current.cursor !== progress.cursor || current.segmentIndex !== progress.segmentIndex) {
    throw new Error("Storyboard set repair state changed before the completed card was saved");
  }
  const cursor = state.cursor + 1;
  return {
    ...state,
    cursor,
    status: cursor >= state.targetSegments.length ? "awaiting_qa" : "repairing",
  };
}

export function normalizeStoryboardSetRepairState(value: unknown): StoryboardSetRepairState | null {
  if (!isRecord(value) || value.schemaVersion !== STORYBOARD_SET_REPAIR_STATE_VERSION) return null;
  if (typeof value.referenceSignature !== "string" || !value.referenceSignature.trim()) return null;
  if (value.status !== "repairing" && value.status !== "awaiting_qa") return null;
  if (!isValidation(value.validation)) return null;
  const targetSegments = normalizeSegmentIndexes(value.targetSegments);
  const snapshot = normalizeSnapshot(value.snapshot);
  const cursor = Math.max(0, Math.min(targetSegments.length, Math.floor(Number(value.cursor) || 0)));
  if (!targetSegments.length || !snapshot.length) return null;
  return {
    schemaVersion: STORYBOARD_SET_REPAIR_STATE_VERSION,
    referenceSignature: value.referenceSignature.trim(),
    qaRound: Math.max(1, Math.floor(Number(value.qaRound) || 1)),
    status: value.status === "awaiting_qa" || cursor >= targetSegments.length ? "awaiting_qa" : "repairing",
    snapshot,
    targetSegments,
    cursor,
    validation: value.validation,
    startedAt: typeof value.startedAt === "string" ? value.startedAt : "",
  };
}

function normalizeSnapshot(value: unknown) {
  const entries = Array.isArray(value) ? value : [];
  const bySegment = new Map<number, StoryboardSetRepairSnapshot>();
  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    const segmentIndex = Number(entry.segmentIndex);
    const url = typeof entry.url === "string" ? entry.url.trim() : "";
    if (Number.isInteger(segmentIndex) && segmentIndex > 0 && url) bySegment.set(segmentIndex, { segmentIndex, url });
  }
  return [...bySegment.values()].sort((left, right) => left.segmentIndex - right.segmentIndex);
}

function normalizeSegmentIndexes(value: unknown) {
  const entries = Array.isArray(value) ? value : [];
  return [...new Set(entries.map(Number).filter((segmentIndex) => Number.isInteger(segmentIndex) && segmentIndex > 0))]
    .sort((left, right) => left - right);
}

function isValidation(value: unknown): value is StoryboardSetVisionValidation {
  return isRecord(value)
    && (value.status === "pass" || value.status === "repair" || value.status === "block")
    && Array.isArray(value.violations)
    && Array.isArray(value.repairInstructions);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
