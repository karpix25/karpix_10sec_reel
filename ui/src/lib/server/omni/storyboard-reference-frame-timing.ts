// Keep director references sparse so the avatar remains the dominant identity reference.
export const STORYBOARD_REFERENCE_FRAMES_PER_SEGMENT = 2;

export type StoryboardReferenceWord = {
  start: number;
  end: number;
};

export type StoryboardReferenceSegment = {
  index: number;
  durationSeconds: number;
  wordCount?: number;
};

export function buildSegmentReferenceSeekSecondsFromWords(input: {
  segment: StoryboardReferenceSegment;
  segments: readonly StoryboardReferenceSegment[];
  words: readonly StoryboardReferenceWord[];
  framesPerSegment?: number;
}) {
  const words = input.words
    .filter((word) => Number.isFinite(word.start) && Number.isFinite(word.end) && word.end > word.start)
    .sort((left, right) => left.start - right.start);
  if (!words.length) return [];

  const sortedSegments = [...input.segments].sort((a, b) => a.index - b.index);
  const position = sortedSegments.findIndex((segment) => segment.index === input.segment.index);
  if (position < 0) return [];
  const useWordWeights = sortedSegments.every((segment) => Number.isFinite(segment.wordCount) && (segment.wordCount || 0) > 0);
  const weight = (segment: StoryboardReferenceSegment) => useWordWeights
    ? segment.wordCount || 0
    : normalizeDuration(segment.durationSeconds, 0) || 0;
  const totalWeight = sortedSegments.reduce((sum, segment) => sum + weight(segment), 0);
  if (!totalWeight) return [];

  const startRatio = sortedSegments.slice(0, position).reduce((sum, segment) => sum + weight(segment), 0) / totalWeight;
  const endRatio = startRatio + weight(input.segment) / totalWeight;
  const startWordIndex = Math.min(words.length - 1, Math.floor(startRatio * words.length));
  const endWordIndex = Math.min(words.length - 1, Math.max(startWordIndex, Math.ceil(endRatio * words.length) - 1));

  return spreadSeekSeconds(
    words[startWordIndex].start,
    words[endWordIndex].end,
    normalizeFrameCount(input.framesPerSegment),
    false
  );
}

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

function spreadSeekSeconds(startSeconds: number, endSeconds: number, count: number, enforceMinimumSpan = true) {
  const safeStart = Math.max(0, startSeconds);
  const safeEnd = enforceMinimumSpan ? Math.max(safeStart + 0.5, endSeconds) : Math.max(safeStart, endSeconds);
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
