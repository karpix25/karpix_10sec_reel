export const OMNI_SEGMENT_SECONDS = 10;
export const OMNI_SPOKEN_WORDS_PER_SECOND = 2.4;

const ALLOWED_DURATIONS_SECONDS = [30, 40] as const;

export function getOmniSegmentWordBudget(segmentSeconds = OMNI_SEGMENT_SECONDS) {
  return Math.floor(segmentSeconds * OMNI_SPOKEN_WORDS_PER_SECOND);
}

export function countOmniScriptWords(script: string) {
  return script.trim().split(/\s+/).filter(Boolean).length;
}

export function planOmniReelDuration(script: string, requestedDurationSeconds: unknown) {
  const requested = normalizeRequestedDuration(requestedDurationSeconds);
  const wordCount = countOmniScriptWords(script);
  const segmentWordBudget = getOmniSegmentWordBudget();
  const duration = ALLOWED_DURATIONS_SECONDS.find(
    (candidate) => candidate >= requested && wordCount <= (candidate / OMNI_SEGMENT_SECONDS) * segmentWordBudget
  );

  if (!duration) {
    const maxDuration = ALLOWED_DURATIONS_SECONDS.at(-1)!;
    const maxWords = (maxDuration / OMNI_SEGMENT_SECONDS) * segmentWordBudget;
    throw new Error(`Сценарий слишком длинный для Omni: ${wordCount} слов при максимуме ${maxWords} слов на ${maxDuration} секунд`);
  }

  return duration;
}

function normalizeRequestedDuration(value: unknown) {
  const parsed = Number.parseInt(String(value || "30"), 10);
  return ALLOWED_DURATIONS_SECONDS.includes(parsed as 30 | 40) ? parsed : 30;
}
