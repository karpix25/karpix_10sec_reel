const TIMESTAMP_EPSILON_SECONDS = 0.03;

export function normalizeWordTokens(value) {
  return String(value || "")
    .toLocaleLowerCase("ru-RU")
    .match(/[\p{L}\p{N}]+/gu) || [];
}

export function normalizeTranscriptWords(words) {
  return (Array.isArray(words) ? words : [])
    .map((word) => ({
      word: String(word?.word || word?.punctuated_word || "").trim(),
      punctuated_word: String(word?.punctuated_word || word?.word || "").trim(),
      start: Number(word?.start),
      end: Number(word?.end),
      confidence: Number.isFinite(Number(word?.confidence)) ? Number(word.confidence) : null,
    }))
    .filter((word) => word.word && Number.isFinite(word.start) && Number.isFinite(word.end) && word.end > word.start)
    .sort((left, right) => left.start - right.start);
}

function levenshtein(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution = previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
      current[rightIndex] = Math.min(
        substitution,
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
      );
    }
    for (let index = 0; index < current.length; index += 1) previous[index] = current[index];
  }
  return previous[right.length];
}

function transcriptMatch(expectedText, recognizedWords) {
  const expected = normalizeWordTokens(expectedText);
  const recognized = normalizeWordTokens(recognizedWords.map((word) => word.word).join(" "));
  const denominator = Math.max(expected.length, recognized.length);
  const distance = levenshtein(expected, recognized);
  return {
    expectedWordCount: expected.length,
    recognizedWordCount: recognized.length,
    editDistance: distance,
    matchRatio: denominator ? Number(Math.max(0, 1 - distance / denominator).toFixed(4)) : 1,
  };
}

function wordsFullyInsideWindow(words, start, end) {
  return words.filter(
    (word) => word.start >= start - TIMESTAMP_EPSILON_SECONDS && word.end <= end + TIMESTAMP_EPSILON_SECONDS,
  );
}

function wordsStartedInsideWindow(words, start, end) {
  return words.filter((word) => word.start >= start - TIMESTAMP_EPSILON_SECONDS && word.start < end);
}

function round(value, digits = 3) {
  return Number(value.toFixed(digits));
}

function average(values) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export function summarizeNumericValues(values) {
  const numericValues = values.filter((value) => Number.isFinite(value));
  return {
    sampleCount: numericValues.length,
    mean: round(average(numericValues)),
    median: round(percentile(numericValues, 0.5)),
    p10: round(percentile(numericValues, 0.1)),
    p25: round(percentile(numericValues, 0.25)),
    p75: round(percentile(numericValues, 0.75)),
    p90: round(percentile(numericValues, 0.9)),
    maximum: round(percentile(numericValues, 1)),
  };
}

export function analyzeSpeechDensity(input) {
  const words = normalizeTranscriptWords(input.words);
  const durationSeconds = Number(input.durationSeconds);
  const frameSeconds = Number(input.frameSeconds || 2);
  const frameCount = Math.max(0, Math.ceil(durationSeconds / frameSeconds));
  const frames = Array.from({ length: frameCount }, (_, index) => {
    const start = index * frameSeconds;
    const end = Math.min(durationSeconds, start + frameSeconds);
    const completeWords = wordsFullyInsideWindow(words, start, end);
    const startedWords = wordsStartedInsideWindow(words, start, end);
    return {
      index: index + 1,
      startSeconds: round(start),
      endSeconds: round(end),
      completeWordCount: completeWords.length,
      startedWordCount: startedWords.length,
      completeWords: completeWords.map((word) => word.word),
      startedWords: startedWords.map((word) => word.word),
    };
  });

  const boundaries = Array.from({ length: Math.max(0, frameCount - 1) }, (_, index) => (index + 1) * frameSeconds);
  const crossingWords = words.filter((word) => boundaries.some((boundary) => word.start < boundary && word.end > boundary));
  const completeCounts = frames.map((frame) => frame.completeWordCount);
  const startedCounts = frames.map((frame) => frame.startedWordCount);
  const match = transcriptMatch(input.expectedVoiceover, words);
  const confidences = words.map((word) => word.confidence).filter((value) => Number.isFinite(value));

  return {
    frameSeconds,
    frameCount,
    wordTimings: words,
    frameMetrics: frames,
    completeWordsPerFrame: summarizeNumericValues(completeCounts),
    startedWordsPerFrame: summarizeNumericValues(startedCounts),
    recognizedWordCount: words.length,
    completeWordCount: completeCounts.reduce((total, count) => total + count, 0),
    crossingWordCount: crossingWords.length,
    crossingWordRate: words.length ? round(crossingWords.length / words.length, 4) : 0,
    averageWordConfidence: confidences.length ? round(average(confidences), 4) : null,
    transcriptMatch: match,
  };
}

function groupResults(results, key) {
  const groups = new Map();
  for (const result of results) {
    const value = String(result[key] ?? "unknown");
    const group = groups.get(value) || [];
    group.push(result);
    groups.set(value, group);
  }
  return Object.fromEntries([...groups.entries()].map(([value, group]) => [value, summarizeResults(group, false)]));
}

export function summarizeResults(results, includeGroups = true) {
  const successful = results.filter((result) => result.metrics);
  const frames = successful.flatMap((result) => result.metrics.frameMetrics);
  const completeCounts = frames.map((frame) => frame.completeWordCount);
  const startedCounts = frames.map((frame) => frame.startedWordCount);
  const recognizedWordCount = successful.reduce((total, result) => total + result.metrics.recognizedWordCount, 0);
  const crossingWordCount = successful.reduce((total, result) => total + result.metrics.crossingWordCount, 0);
  const matches = successful.map((result) => result.metrics.transcriptMatch.matchRatio);

  return {
    videoCount: successful.length,
    failedVideoCount: results.length - successful.length,
    frameCount: frames.length,
    recognizedWordCount,
    completeWordCount: successful.reduce((total, result) => total + result.metrics.completeWordCount, 0),
    crossingWordCount,
    crossingWordRate: recognizedWordCount ? round(crossingWordCount / recognizedWordCount, 4) : 0,
    completeWordsPerTwoSeconds: summarizeNumericValues(completeCounts),
    startedWordsPerTwoSeconds: summarizeNumericValues(startedCounts),
    transcriptMatchRatio: summarizeNumericValues(matches),
    ...(includeGroups ? { byDurationSeconds: groupResults(successful, "durationBucketSeconds") } : {}),
  };
}
