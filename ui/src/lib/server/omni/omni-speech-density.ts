import {
  OMNI_STORYBOARD_ALLOWED_SEGMENT_SECONDS,
  OMNI_STORYBOARD_MAX_FRAME_WORDS,
  OMNI_STORYBOARD_MIN_FRAME_WORDS,
  getOmniStoryboardDurationForWordCount,
  getOmniStoryboardWordRange,
  type OmniStoryboardAllowedSegmentSeconds,
} from "../../omni/storyboard/omni-storyboard-timing";

export const OMNI_SEGMENT_SECONDS = 10;
export const OMNI_ALLOWED_SEGMENT_SECONDS = OMNI_STORYBOARD_ALLOWED_SEGMENT_SECONDS;
export type OmniAllowedSegmentSeconds = (typeof OMNI_ALLOWED_SEGMENT_SECONDS)[number];
export type { OmniStoryboardAllowedSegmentSeconds };

export const OMNI_MIN_SEGMENT_COUNT = 2;
export const OMNI_MAX_SEGMENT_COUNT = 5;
export const OMNI_MIN_USEFUL_SEGMENT_WORDS = OMNI_STORYBOARD_ALLOWED_SEGMENT_SECONDS[0] /
  2 * OMNI_STORYBOARD_MIN_FRAME_WORDS;
export const OMNI_TARGET_SEGMENT_WORDS_MIN = OMNI_MIN_USEFUL_SEGMENT_WORDS;
export const OMNI_TARGET_SEGMENT_WORDS_MAX = OMNI_SEGMENT_SECONDS / 2 * OMNI_STORYBOARD_MAX_FRAME_WORDS;
export const OMNI_MIN_VIABLE_SEGMENT_WORDS = OMNI_MIN_USEFUL_SEGMENT_WORDS;
export const OMNI_MIN_SCRIPT_WORDS = OMNI_MIN_SEGMENT_COUNT * OMNI_MIN_USEFUL_SEGMENT_WORDS;

export function getOmniSegmentWordBudget(segmentSeconds = OMNI_SEGMENT_SECONDS) {
  return getOmniStoryboardWordRange(segmentSeconds)?.maxWords || 0;
}

export function getOmniSegmentMinWords(segmentSeconds = OMNI_SEGMENT_SECONDS) {
  return getOmniStoryboardWordRange(segmentSeconds)?.minWords || OMNI_MIN_USEFUL_SEGMENT_WORDS;
}

export function getOmniSegmentDurationForWordCount(wordCount: number): OmniAllowedSegmentSeconds | null {
  return getOmniStoryboardDurationForWordCount(wordCount);
}

export function getOmniSegmentDurationsForWordCount(wordCount: number): OmniAllowedSegmentSeconds[] {
  const duration = getOmniStoryboardDurationForWordCount(wordCount);
  return duration ? [duration] : [];
}

export function getOmniMaxScriptWords() {
  return OMNI_MAX_SEGMENT_COUNT * getOmniSegmentWordBudget();
}

export function isOmniSegmentCountViable(wordCount: number, segmentCount: number) {
  if (segmentCount < OMNI_MIN_SEGMENT_COUNT) return false;
  if (wordCount % OMNI_STORYBOARD_MIN_FRAME_WORDS !== 0) return false;
  if (wordCount > segmentCount * getOmniSegmentWordBudget()) return false;
  return wordCount >= segmentCount * OMNI_MIN_VIABLE_SEGMENT_WORDS;
}

export function getPreferredOmniSegmentCount(wordCount: number) {
  const requiredSegmentCount = Math.ceil(wordCount / getOmniSegmentWordBudget());
  if (requiredSegmentCount > OMNI_MAX_SEGMENT_COUNT) return null;
  const maxSegmentCount = OMNI_MAX_SEGMENT_COUNT;
  for (let segmentCount = OMNI_MIN_SEGMENT_COUNT; segmentCount <= maxSegmentCount; segmentCount += 1) {
    if (isOmniSegmentCountViable(wordCount, segmentCount)) return segmentCount;
  }
  return null;
}

export function describeOmniDensityGap(wordCount: number) {
  if (wordCount > getOmniMaxScriptWords()) {
    return (
      `Сценарий не помещается в доступные Omni-длительности: ${wordCount} слов. ` +
      `Максимум ${getOmniMaxScriptWords()} слов для ${OMNI_MAX_SEGMENT_COUNT} частей по 4/6/8/10 секунд.`
    );
  }
  if (wordCount < OMNI_MIN_SCRIPT_WORDS) {
    return `Сценарий слишком короткий: ${wordCount} слов. Для двух частей по 4 секунды нужно минимум ${OMNI_MIN_SCRIPT_WORDS} слов.`;
  }
  if (wordCount % OMNI_STORYBOARD_MIN_FRAME_WORDS !== 0) {
    return `Сценарий отклонен: ${wordCount} слов нельзя разложить по кадрам. Количество слов должно делиться на четыре без остатка.`;
  }
  return "Сценарий не помещается в доступные Omni-длительности.";
}
