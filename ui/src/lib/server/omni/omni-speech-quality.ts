export type OmniSpeechQuality = {
  passed: boolean;
  expected: string;
  actual: string;
  expectedCoverage: number;
  duplicateWords: string[];
  repeatedPhrases: string[];
};

export class OmniSpeechQualityError extends Error {
  constructor(readonly quality: OmniSpeechQuality) {
    const defects = [
      quality.duplicateWords.length ? `повторы слов: ${quality.duplicateWords.join(", ")}` : "",
      quality.repeatedPhrases.length ? `повторы фраз: ${quality.repeatedPhrases.join(", ")}` : "",
      quality.expectedCoverage < 0.78 ? `покрытие реплики: ${Math.round(quality.expectedCoverage * 100)}%` : "",
    ].filter(Boolean).join("; ");
    super(`Omni speech QA failed: ${defects || "реплика не совпала"}`);
    this.name = "OmniSpeechQualityError";
  }
}

export function assessOmniSpeechQuality(expected: string, actual: string): OmniSpeechQuality {
  const expectedWords = tokenize(expected);
  const actualWords = tokenize(actual);
  const expectedCoverage = expectedWords.length
    ? longestCommonSubsequenceLength(expectedWords, actualWords) / expectedWords.length
    : actualWords.length ? 0 : 1;
  const duplicateWords = findUnexpectedDuplicateWords(expectedWords, actualWords);
  const repeatedPhrases = findUnexpectedRepeatedPhrases(expectedWords, actualWords);

  return {
    passed: expectedCoverage >= 0.78 && !duplicateWords.length && !repeatedPhrases.length,
    expected,
    actual,
    expectedCoverage: Number(expectedCoverage.toFixed(3)),
    duplicateWords,
    repeatedPhrases,
  };
}

export function assertOmniSpeechQuality(expected: string, actual: string) {
  const quality = assessOmniSpeechQuality(expected, actual);
  if (!quality.passed) throw new OmniSpeechQualityError(quality);
  return quality;
}

function tokenize(value: string) {
  return (value.toLocaleLowerCase("ru").replaceAll("ё", "е").match(/[\p{L}\p{N}]+/gu) || []);
}

function findUnexpectedDuplicateWords(expected: string[], actual: string[]) {
  const expectedCounts = countItems(expected);
  const actualCounts = countItems(actual);
  return [...actualCounts]
    .filter(([word, count]) => word.length >= 4 && count > (expectedCounts.get(word) || 0) && count > 1)
    .map(([word]) => word)
    .sort();
}

function findUnexpectedRepeatedPhrases(expected: string[], actual: string[]) {
  const repeats = new Set<string>();
  for (let size = 2; size <= 4; size += 1) {
    const expectedCounts = countItems(toNgrams(expected, size));
    for (const [phrase, count] of countItems(toNgrams(actual, size))) {
      if (count > 1 && count > (expectedCounts.get(phrase) || 0)) repeats.add(phrase);
    }
  }
  return [...repeats].sort((left, right) => left.length - right.length).slice(0, 5);
}

function toNgrams(words: string[], size: number) {
  return words.slice(0, Math.max(0, words.length - size + 1)).map((_, index) => words.slice(index, index + size).join(" "));
}

function countItems(items: string[]) {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item, (counts.get(item) || 0) + 1);
  return counts;
}

function longestCommonSubsequenceLength(left: string[], right: string[]) {
  const previous = new Array<number>(right.length + 1).fill(0);
  for (const leftWord of left) {
    let diagonal = 0;
    for (let index = 1; index <= right.length; index += 1) {
      const above = previous[index];
      previous[index] = leftWord === right[index - 1]
        ? diagonal + 1
        : Math.max(previous[index], previous[index - 1]);
      diagonal = above;
    }
  }
  return previous[right.length];
}
