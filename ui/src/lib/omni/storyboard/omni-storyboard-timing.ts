export const OMNI_STORYBOARD_ALLOWED_SEGMENT_SECONDS = [4, 6, 8, 10] as const;
export type OmniStoryboardAllowedSegmentSeconds = (typeof OMNI_STORYBOARD_ALLOWED_SEGMENT_SECONDS)[number];

export const OMNI_STORYBOARD_SECONDS_PER_FRAME = 2;
export const OMNI_STORYBOARD_TARGET_FRAME_WORDS = 4;
export const OMNI_STORYBOARD_MIN_FRAME_WORDS = 3;
export const OMNI_STORYBOARD_MAX_FRAME_WORDS = 4;

export function isOmniStoryboardDuration(value: number): value is OmniStoryboardAllowedSegmentSeconds {
  return OMNI_STORYBOARD_ALLOWED_SEGMENT_SECONDS.includes(value as OmniStoryboardAllowedSegmentSeconds);
}

export function getOmniStoryboardFrameCount(durationSeconds: number) {
  return isOmniStoryboardDuration(durationSeconds)
    ? durationSeconds / OMNI_STORYBOARD_SECONDS_PER_FRAME
    : null;
}

export function getOmniStoryboardWordRange(durationSeconds: number) {
  const frameCount = getOmniStoryboardFrameCount(durationSeconds);
  if (!frameCount) return null;
  return {
    minWords: frameCount * OMNI_STORYBOARD_MIN_FRAME_WORDS,
    maxWords: frameCount * OMNI_STORYBOARD_MAX_FRAME_WORDS,
  };
}

export function getOmniStoryboardDurationForWordCount(wordCount: number) {
  if (!Number.isInteger(wordCount) || wordCount <= 0) return null;
  const targetSeconds = Math.ceil(wordCount / OMNI_STORYBOARD_TARGET_FRAME_WORDS) * OMNI_STORYBOARD_SECONDS_PER_FRAME;
  return OMNI_STORYBOARD_ALLOWED_SEGMENT_SECONDS.find((durationSeconds) => {
    const range = getOmniStoryboardWordRange(durationSeconds);
    return Boolean(
      range &&
      wordCount >= range.minWords &&
      wordCount <= range.maxWords &&
      (durationSeconds >= targetSeconds || durationSeconds === OMNI_STORYBOARD_ALLOWED_SEGMENT_SECONDS.at(-1))
    );
  }) || null;
}

export function getOmniStoryboardFrameWordCounts(wordCount: number, durationSeconds: number) {
  const frameCount = getOmniStoryboardFrameCount(durationSeconds);
  const range = getOmniStoryboardWordRange(durationSeconds);
  if (!frameCount || !range || wordCount < range.minWords || wordCount > range.maxWords) return null;
  const baseWords = Math.floor(wordCount / frameCount);
  const remainder = wordCount % frameCount;
  const counts = Array.from({ length: frameCount }, (_, index) => baseWords + (index < remainder ? 1 : 0));
  return counts.every((count) => count >= OMNI_STORYBOARD_MIN_FRAME_WORDS && count <= OMNI_STORYBOARD_MAX_FRAME_WORDS)
    ? counts
    : null;
}
