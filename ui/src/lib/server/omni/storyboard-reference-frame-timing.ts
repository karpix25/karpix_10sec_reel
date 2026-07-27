export const STORYBOARD_REFERENCE_FRAMES_PER_SEGMENT = 5;

export type StoryboardReferenceSegment = {
  index: number;
  durationSeconds: number;
};

export function buildSegmentReferenceSeekSeconds(input: {
  segment: StoryboardReferenceSegment;
  segments: readonly StoryboardReferenceSegment[];
  sourceDurationSeconds?: number | null;
  framesPerSegment?: number;
}) {
  const framesPerSegment = normalizeFrameCount(input.framesPerSegment);
  const sortedSegments = [...input.segments].sort((a, b) => a.index - b.index);
  const segmentIndex = Math.max(1, input.segment.index);
  const sourceDuration = normalizeDuration(input.sourceDurationSeconds);

  if (sourceDuration) {
    const segmentCount = Math.max(1, sortedSegments.length);
    const startSeconds = ((segmentIndex - 1) / segmentCount) * sourceDuration;
    const endSeconds = (segmentIndex / segmentCount) * sourceDuration;
    return spreadSeekSeconds(startSeconds, endSeconds, framesPerSegment);
  }

  const startSeconds = sortedSegments
    .filter((segment) => segment.index < segmentIndex)
    .reduce((sum, segment) => sum + (normalizeDuration(segment.durationSeconds, 0) || 0), 0);
  const currentDuration = normalizeDuration(input.segment.durationSeconds, 10) || 10;
  return spreadSeekSeconds(startSeconds, startSeconds + currentDuration, framesPerSegment);
}

export function readSourceDurationSeconds(value: unknown): number | null {
  return readDurationSeconds(value, 0);
}

function spreadSeekSeconds(startSeconds: number, endSeconds: number, count: number) {
  const safeStart = Math.max(0, startSeconds);
  const safeEnd = Math.max(safeStart + 0.5, endSeconds);
  const span = safeEnd - safeStart;
  return Array.from({ length: count }, (_, index) => {
    const seek = safeStart + (span * (index + 1)) / (count + 1);
    return Number(seek.toFixed(2));
  });
}

function readDurationSeconds(value: unknown, depth: number): number | null {
  if (depth > 5 || value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const direct = normalizeDuration(record.duration_seconds) || normalizeDuration(record.durationSeconds);
  if (direct) return direct;

  for (const [key, child] of Object.entries(record)) {
    if (!/source|snapshot|director|video|reference|media/iu.test(key)) continue;
    const nested = readDurationSeconds(child, depth + 1);
    if (nested) return nested;
  }
  return null;
}

function normalizeFrameCount(value: number | undefined) {
  return Number.isInteger(value) && value && value > 0 ? value : STORYBOARD_REFERENCE_FRAMES_PER_SEGMENT;
}

function normalizeDuration(value: unknown, fallback: number | null = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}
