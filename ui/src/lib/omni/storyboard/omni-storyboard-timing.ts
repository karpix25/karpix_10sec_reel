export const OMNI_STORYBOARD_ALLOWED_SEGMENT_SECONDS = [4, 6, 8, 10] as const;
export type OmniStoryboardAllowedSegmentSeconds = (typeof OMNI_STORYBOARD_ALLOWED_SEGMENT_SECONDS)[number];

export const OMNI_STORYBOARD_SECONDS_PER_FRAME = 2;
export const OMNI_STORYBOARD_MIN_FRAME_WORDS = 4;
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
  return OMNI_STORYBOARD_ALLOWED_SEGMENT_SECONDS.find((durationSeconds) => {
    const range = getOmniStoryboardWordRange(durationSeconds);
    if (!range) return false;
    const tailWords = getOmniStoryboardTailWordCount(wordCount);
    return wordCount >= range.minWords && wordCount <= range.maxWords + (tailWords || 0);
  }) || null;
}

export function getOmniStoryboardTailWordCount(wordCount: number) {
  const remainder = wordCount % OMNI_STORYBOARD_MIN_FRAME_WORDS;
  return remainder === 1 || remainder === 2 ? remainder : 0;
}

export function getOmniStoryboardFrameWordCounts(wordCount: number, durationSeconds: number) {
  const frameCount = getOmniStoryboardFrameCount(durationSeconds);
  const range = getOmniStoryboardWordRange(durationSeconds);
  const tailWords = getOmniStoryboardTailWordCount(wordCount);
  if (!frameCount || !range || wordCount < range.minWords || wordCount > range.maxWords + tailWords) return null;
  return Array.from({ length: frameCount }, (_, index) =>
    OMNI_STORYBOARD_MIN_FRAME_WORDS + (index >= frameCount - tailWords ? 1 : 0)
  );
}
