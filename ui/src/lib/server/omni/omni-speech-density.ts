export const OMNI_SEGMENT_SECONDS = 10;
export const OMNI_ALLOWED_SEGMENT_SECONDS = [10] as const;
export type OmniAllowedSegmentSeconds = (typeof OMNI_ALLOWED_SEGMENT_SECONDS)[number];
export const OMNI_SPOKEN_WORDS_PER_SECOND = 2;

export const OMNI_MIN_SEGMENT_COUNT = 2;
export const OMNI_MAX_SEGMENT_COUNT = 4;
export const OMNI_MIN_USEFUL_SEGMENT_WORDS = 15;
export const OMNI_TARGET_SEGMENT_WORDS_MIN = 15;
export const OMNI_TARGET_SEGMENT_WORDS_MAX = 20;
export const OMNI_MIN_VIABLE_SEGMENT_WORDS = OMNI_MIN_USEFUL_SEGMENT_WORDS;
export const OMNI_MIN_SCRIPT_WORDS = OMNI_MIN_SEGMENT_COUNT * OMNI_MIN_USEFUL_SEGMENT_WORDS;

export function getOmniSegmentWordBudget(segmentSeconds = OMNI_SEGMENT_SECONDS) {
  return Math.floor(segmentSeconds * OMNI_SPOKEN_WORDS_PER_SECOND);
}

export function getOmniSegmentDurationForWordCount(wordCount: number): OmniAllowedSegmentSeconds | null {
  if (wordCount < OMNI_MIN_USEFUL_SEGMENT_WORDS) return null;
  return OMNI_ALLOWED_SEGMENT_SECONDS.find((seconds) => wordCount <= getOmniSegmentWordBudget(seconds)) || null;
}

export function getOmniMaxScriptWords() {
  return OMNI_MAX_SEGMENT_COUNT * getOmniSegmentWordBudget();
}

export function isOmniSegmentCountViable(wordCount: number, segmentCount: number) {
  if (segmentCount < OMNI_MIN_SEGMENT_COUNT || segmentCount > OMNI_MAX_SEGMENT_COUNT) return false;
  if (wordCount > segmentCount * getOmniSegmentWordBudget()) return false;
  return wordCount >= segmentCount * OMNI_MIN_VIABLE_SEGMENT_WORDS;
}

export function getPreferredOmniSegmentCount(wordCount: number) {
  for (let segmentCount = OMNI_MIN_SEGMENT_COUNT; segmentCount <= OMNI_MAX_SEGMENT_COUNT; segmentCount += 1) {
    if (isOmniSegmentCountViable(wordCount, segmentCount)) return segmentCount;
  }
  return null;
}

export function describeOmniDensityGap(wordCount: number) {
  if (wordCount < OMNI_MIN_SCRIPT_WORDS) {
    return `Сценарий слишком короткий: ${wordCount} слов. Для двух частей по 10 секунд нужно минимум ${OMNI_MIN_SCRIPT_WORDS} слов.`;
  }
  return (
    `Сценарий не помещается в доступные Omni-длительности: ${wordCount} слов. ` +
    `Максимум ${getOmniMaxScriptWords()} слов для ${OMNI_MAX_SEGMENT_COUNT} частей по ${OMNI_SEGMENT_SECONDS} секунд.`
  );
}
