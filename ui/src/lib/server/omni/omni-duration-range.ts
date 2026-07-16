import {
  OMNI_ALLOWED_SEGMENT_SECONDS,
  OMNI_MAX_SEGMENT_COUNT,
  OMNI_MIN_SCRIPT_WORDS,
  OMNI_MIN_SEGMENT_COUNT,
  OMNI_MIN_USEFUL_SEGMENT_WORDS,
  OMNI_SEGMENT_SECONDS,
  getOmniMaxScriptWords,
  getOmniSegmentWordBudget,
  type OmniAllowedSegmentSeconds,
} from "./omni-speech-density";

export type OmniDurationRangeSource = "client_settings" | "product_target" | "request_target" | "default";

export type OmniDurationRange = {
  requestedMinSeconds: number;
  requestedMaxSeconds: number;
  minSeconds: number;
  maxSeconds: number;
  minWords: number;
  maxWords: number;
  source: OmniDurationRangeSource;
  wasClamped: boolean;
};

type NormalizeDurationRangeInput = {
  requestedMinSeconds?: unknown;
  requestedMaxSeconds?: unknown;
  fallbackSeconds?: unknown;
  source: OmniDurationRangeSource;
};

const MIN_OMNI_DURATION_SECONDS = OMNI_MIN_SEGMENT_COUNT * OMNI_ALLOWED_SEGMENT_SECONDS[0];
const MAX_OMNI_DURATION_SECONDS = OMNI_MAX_SEGMENT_COUNT * OMNI_SEGMENT_SECONDS;

export function normalizeOmniDurationRange(input: NormalizeDurationRangeInput): OmniDurationRange {
  const fallbackSeconds = readPositiveNumber(input.fallbackSeconds) || 30;
  const requestedMinSeconds = readPositiveNumber(input.requestedMinSeconds) || fallbackSeconds;
  const requestedMaxSeconds = Math.max(
    requestedMinSeconds,
    readPositiveNumber(input.requestedMaxSeconds) || requestedMinSeconds
  );
  const minSeconds = clamp(requestedMinSeconds, MIN_OMNI_DURATION_SECONDS, MAX_OMNI_DURATION_SECONDS);
  const maxSeconds = clamp(Math.max(minSeconds, requestedMaxSeconds), minSeconds, MAX_OMNI_DURATION_SECONDS);
  const wordRange = getWordRangeForDurationRange(minSeconds, maxSeconds);

  return {
    requestedMinSeconds,
    requestedMaxSeconds,
    minSeconds,
    maxSeconds,
    minWords: wordRange.minWords,
    maxWords: wordRange.maxWords,
    source: input.source,
    wasClamped: minSeconds !== requestedMinSeconds || maxSeconds !== requestedMaxSeconds,
  };
}

export function getSupportedOmniDurationRange() {
  return {
    minSeconds: MIN_OMNI_DURATION_SECONDS,
    maxSeconds: MAX_OMNI_DURATION_SECONDS,
  };
}

function getWordRangeForDurationRange(minSeconds: number, maxSeconds: number) {
  const candidates = enumerateDurationCombos().filter((combo) => {
    const duration = sum(combo);
    return duration >= minSeconds && duration <= maxSeconds;
  });

  if (!candidates.length) {
    return {
      minWords: OMNI_MIN_SCRIPT_WORDS,
      maxWords: getOmniMaxScriptWords(),
    };
  }

  const minWords = Math.min(...candidates.map((combo) => sum(combo.map(getMinWordsForDuration))));
  const maxWords = Math.max(...candidates.map((combo) => sum(combo.map(getOmniSegmentWordBudget))));
  const stableMinWords = minSeconds === maxSeconds ? Math.max(minWords, Math.ceil(maxWords * 0.82)) : minWords;
  const finalMinWords = Math.max(OMNI_MIN_SCRIPT_WORDS, stableMinWords);

  return {
    minWords: finalMinWords,
    maxWords: Math.min(getOmniMaxScriptWords(), Math.max(finalMinWords, maxWords)),
  };
}

function enumerateDurationCombos() {
  const combos: OmniAllowedSegmentSeconds[][] = [];
  for (let count = OMNI_MIN_SEGMENT_COUNT; count <= OMNI_MAX_SEGMENT_COUNT; count += 1) {
    appendDurationCombos([], count, combos);
  }
  return combos;
}

function appendDurationCombos(
  prefix: OmniAllowedSegmentSeconds[],
  remaining: number,
  output: OmniAllowedSegmentSeconds[][]
) {
  if (remaining === 0) {
    output.push(prefix);
    return;
  }

  for (const seconds of OMNI_ALLOWED_SEGMENT_SECONDS) {
    appendDurationCombos([...prefix, seconds], remaining - 1, output);
  }
}

function getMinWordsForDuration(duration: OmniAllowedSegmentSeconds) {
  const index = OMNI_ALLOWED_SEGMENT_SECONDS.indexOf(duration);
  if (index <= 0) return OMNI_MIN_USEFUL_SEGMENT_WORDS;
  const previousDuration = OMNI_ALLOWED_SEGMENT_SECONDS[index - 1];
  return getOmniSegmentWordBudget(previousDuration) + 1;
}

function readPositiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function sum(values: readonly number[]) {
  return values.reduce((total, value) => total + value, 0);
}
