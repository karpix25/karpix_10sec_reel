export const OMNI_SEGMENT_SECONDS = 10;
export const OMNI_SPOKEN_WORDS_PER_SECOND = 2.8;

export const OMNI_MIN_SEGMENT_COUNT = 1;
export const OMNI_MAX_SEGMENT_COUNT = 4;
export const OMNI_TARGET_SEGMENT_WORDS_MIN = 22;
export const OMNI_TARGET_SEGMENT_WORDS_MAX = 28;
export const OMNI_MIN_VIABLE_SEGMENT_WORDS = 18;
export const OMNI_MIN_SCRIPT_WORDS = OMNI_TARGET_SEGMENT_WORDS_MIN;

export function getOmniSegmentWordBudget(segmentSeconds = OMNI_SEGMENT_SECONDS) {
  return Math.floor(segmentSeconds * OMNI_SPOKEN_WORDS_PER_SECOND);
}

export function getOmniMaxScriptWords() {
  return OMNI_MAX_SEGMENT_COUNT * getOmniSegmentWordBudget();
}

export function isOmniSegmentCountViable(wordCount: number, segmentCount: number) {
  if (segmentCount < OMNI_MIN_SEGMENT_COUNT || segmentCount > OMNI_MAX_SEGMENT_COUNT) return false;
  if (wordCount > segmentCount * getOmniSegmentWordBudget()) return false;
  if (segmentCount === 1) {
    return wordCount >= OMNI_MIN_SCRIPT_WORDS;
  }
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
    return `Сценарий слишком короткий: ${wordCount} слов. Для 10 секунд нужно минимум ${OMNI_MIN_SCRIPT_WORDS} слова.`;
  }
  return (
    `Сценарий попал в пустую зону плотности: ${wordCount} слов. ` +
    `Сократите до ${OMNI_TARGET_SEGMENT_WORDS_MAX} слов для 10 секунд или расширьте до ` +
    `${OMNI_MIN_VIABLE_SEGMENT_WORDS * 2}+ слов, чтобы 20 секунд не заполнялись паузами.`
  );
}
