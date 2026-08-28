export type VoiceSegment = {
  index: number;
  text: string;
  wordCount: number;
};

const BAD_ENDINGS = new Set([
  "а",
  "без",
  "в",
  "для",
  "до",
  "за",
  "и",
  "из",
  "или",
  "к",
  "как",
  "можете",
  "можно",
  "на",
  "но",
  "о",
  "об",
  "от",
  "по",
  "под",
  "при",
  "про",
  "с",
  "со",
  "у",
  "что",
  "чтобы",
  "который",
  "которая",
  "которое",
  "которые",
  "такой",
  "такая",
  "такое",
  "такие",
  "этот",
  "эта",
  "это",
  "эти",
  "если",
  "потому",
  "позволяет",
  "помогает",
]);

const BAD_STARTINGS = new Set([
  "а",
  "без",
  "ведь",
  "для",
  "и",
  "или",
  "когда",
  "но",
  "потому",
  "поэтому",
  "с",
  "со",
  "то",
  "который",
  "которая",
  "которое",
  "которые",
  "если",
  "чтобы",
]);

const PROTECTED_PHRASES = [
  /артикул(?:\s+\S+){0,5}\s+(?:в|под)\s+(?:описании|видео)/giu,
  /код(?:\s+\S+){0,5}\s+(?:в|под)\s+(?:описании|видео)/giu,
  /(?:напиши|напишите|оставь|оставьте)(?:\s+\S+){0,4}\s+в\s+комментариях/giu,
  /кодовое\s+слово\s+[«"]?\S+[»"]?/giu,
];

const INCOMPLETE_ENDING_PATTERNS = [
  /(?:^|\s)(?:можно|можете|позволяет|помогает|начинает|продолжает|хочется|нужно|важно)\s+(?:готовить|сделать|получить|найти|добавить|использовать|сохранить|убрать|заменить)[,.!?;:»"]?$/iu,
  /(?:^|\s)(?:готовить|получить|сделать|создать|добавить|показать)\s+[\p{L}-]+(?:ые|ие|ую|ое|ый|ий|ая|яя|ой|ий)[,.!?;:»"]?$/iu,
  /(?:^|\s)(?:это|такой|такая|такое|он|она|они)\s+(?:становится|станет|помогает|позволяет|дает|даёт)[,.!?;:»"]?$/iu,
  /(?:^|\s)(?:для|тем|тех|если|когда|потому|поэтому|например)[,.!?;:»"]?$/iu,
  /(?:^|\s)(?:который|которая|которое|которые|такой|такая|такое|такие|этот|эта|это|эти|если|потому|чтобы)[,.!?;:»"]?$/iu,
  /(?:^|\s)(?:про|о|об)\s+(?:этот|эта|это|тот|та|то|мой|моя|его|ее|её)[,.!?;:»"]?$/iu,
];

const DEFAULT_SEGMENT_SOFT_WORD_LIMIT = 24;
const DEFAULT_SEGMENT_MIN_WORD_LIMIT = 8;

type Token = {
  value: string;
  start: number;
  end: number;
};

export function splitScriptIntoVoiceSegments(
  script: string,
  segmentCount: number,
  maxWordsPerSegment?: number,
  minWordsPerSegment?: number,
  isSegmentWordCountAllowed?: (wordCount: number) => boolean,
  targetWordCounts?: readonly number[],
  allowAwkwardBoundaries = false,
  requireSentenceBoundaries = false
): VoiceSegment[] {
  const normalized = normalizeScriptText(script);
  if (!normalized || segmentCount <= 0) return [];

  const tokens = tokenize(normalized);
  if (!tokens.length) return [];
  const count = Math.min(segmentCount, tokens.length);
  if (
    targetWordCounts &&
    (targetWordCounts.length !== count ||
      targetWordCounts.some((wordCount) => wordCount < 1) ||
      targetWordCounts.reduce((sum, wordCount) => sum + wordCount, 0) !== tokens.length)
  ) {
    throw new Error("Target segment word counts do not match the script");
  }
  const protectedBoundaries = findProtectedBoundaries(normalized, tokens);
  if (maxWordsPerSegment && tokens.length > count * maxWordsPerSegment) {
    throw new Error(
      `Script has ${tokens.length} words, but ${count} segments can fit at most ${count * maxWordsPerSegment}`
    );
  }
  const boundaries = findBestBoundaries(
    tokens,
    count,
    protectedBoundaries,
    maxWordsPerSegment,
    minWordsPerSegment,
    isSegmentWordCountAllowed,
    targetWordCounts,
    allowAwkwardBoundaries,
    requireSentenceBoundaries
  );
  const chunks: VoiceSegment[] = [];

  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    chunks.push({
      index: index + 1,
      text: tokens.slice(start, end).map((token) => token.value).join(" "),
      wordCount: end - start,
    });
  }

  return chunks;
}

export function hasCompletedSentenceBoundary(text: string) {
  return /[.!?…]+[»”"']?$/u.test(text.trim());
}

export function normalizeScriptText(script: string) {
  return script.replace(/\s+/g, " ").trim();
}

export function reconstructVoiceSegments(segments: VoiceSegment[]) {
  return normalizeScriptText(segments.map((segment) => segment.text).join(" "));
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /\S+/gu;
  for (const match of text.matchAll(pattern)) {
    const start = match.index || 0;
    tokens.push({ value: match[0], start, end: start + match[0].length });
  }
  return tokens;
}

function findProtectedBoundaries(text: string, tokens: Token[]) {
  const protectedBoundaries = new Set<number>();
  for (const pattern of PROTECTED_PHRASES) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const matchStart = match.index || 0;
      const matchEnd = matchStart + match[0].length;
      for (let boundary = 1; boundary < tokens.length; boundary += 1) {
        const position = tokens[boundary].start;
        if (position > matchStart && position < matchEnd) protectedBoundaries.add(boundary);
      }
    }
  }
  return protectedBoundaries;
}

/**
 * Finds the best segment boundaries for splitting the script.
 * If the solver cannot find a solution without breaking protected CTA phrases,
 * it falls back to a deterministic split that keeps all words and segment budgets.
 */
function findBestBoundaries(
  tokens: Token[],
  count: number,
  protectedBoundaries: Set<number>,
  maxWordsPerSegment?: number,
  minWordsPerSegment?: number,
  isSegmentWordCountAllowed?: (wordCount: number) => boolean,
  targetWordCounts?: readonly number[],
  allowAwkwardBoundaries = false,
  requireSentenceBoundaries = false
) {
  if (count === 1) return [0, tokens.length];
  const target = tokens.length / count;

  // Attempt 1: respect CTA protected boundaries and the segment word budget.
  let boundaries = solveBoundaries(
    tokens,
    count,
    target,
    protectedBoundaries,
    maxWordsPerSegment,
    minWordsPerSegment,
    isSegmentWordCountAllowed,
    targetWordCounts,
    allowAwkwardBoundaries,
    requireSentenceBoundaries
  );

  if (!boundaries) {
    // Fallback: keep the word budget, but allow a split inside protected CTA text.
    boundaries = solveBoundaries(
      tokens,
      count,
      target,
      new Set<number>(),
      maxWordsPerSegment,
      minWordsPerSegment,
      isSegmentWordCountAllowed,
      targetWordCounts,
      allowAwkwardBoundaries,
      requireSentenceBoundaries
    );
  }

  if (!boundaries && allowAwkwardBoundaries && targetWordCounts) {
    boundaries = solveBoundaries(
      tokens,
      count,
      target,
      new Set<number>(),
      maxWordsPerSegment,
      minWordsPerSegment,
      isSegmentWordCountAllowed,
      targetWordCounts,
      true,
      requireSentenceBoundaries
    );
  }

  if (!boundaries) throw new Error("Script cannot be split into non-empty segments");
  return [0, ...boundaries];
}

function solveBoundaries(
  tokens: Token[],
  count: number,
  target: number,
  protectedBoundaries: Set<number>,
  maxWordsPerSegment?: number,
  minWordsPerSegment?: number,
  isSegmentWordCountAllowed?: (wordCount: number) => boolean,
  targetWordCounts?: readonly number[],
  allowAwkwardBoundaries = false,
  requireSentenceBoundaries = false
) {
  const memo = new Map<string, { score: number; boundaries: number[] } | null>();
  const minWords = minWordsPerSegment && minWordsPerSegment > 0 ? minWordsPerSegment : 1;

  function solve(start: number, remaining: number): { score: number; boundaries: number[] } | null {
    const key = `${start}:${remaining}`;
    if (memo.has(key)) return memo.get(key) || null;
    if (remaining === 1) {
      const length = tokens.length - start;
      const targetLength = targetWordCounts?.[count - remaining];
      const fits = !maxWordsPerSegment || length <= maxWordsPerSegment;
      const allowed = !isSegmentWordCountAllowed || isSegmentWordCountAllowed(length);
      const hasTargetLength = targetLength == null || length === targetLength;
      const result = length >= minWords && fits && allowed && hasTargetLength
        ? { score: segmentPenalty(tokens, start, tokens.length, target), boundaries: [tokens.length] }
        : null;
      memo.set(key, result);
      return result;
    }

    let best: { score: number; boundaries: number[] } | null = null;
    const targetLength = targetWordCounts?.[count - remaining];
    const minEnd = targetLength == null ? start + minWords : start + targetLength;
    const maxEnd = targetLength == null
      ? tokens.length - (remaining - 1) * minWords
      : minEnd;
    for (let end = minEnd; end <= maxEnd; end += 1) {
      if (protectedBoundaries.has(end)) continue;
      if (requireSentenceBoundaries && !hasCompletedSentenceBoundary(tokens[end - 1].value)) continue;
      if (!allowAwkwardBoundaries && BAD_ENDINGS.has(normalizeBoundaryWord(tokens[end - 1].value))) continue;
      if (maxWordsPerSegment && end - start > maxWordsPerSegment) break;
      if (isSegmentWordCountAllowed && !isSegmentWordCountAllowed(end - start)) continue;
      const tail = solve(end, remaining - 1);
      if (!tail) continue;
      const score = segmentPenalty(tokens, start, end, target) +
        boundaryPenalty(tokens[end - 1].value) +
        boundaryTransitionPenalty(tokens, end) +
        boundaryContextPenalty(tokens, end) +
        tail.score;
      if (!best || score < best.score) best = { score, boundaries: [end, ...tail.boundaries] };
    }
    memo.set(key, best);
    return best;
  }

  return solve(0, count)?.boundaries || null;
}

function segmentPenalty(tokens: Token[], start: number, end: number, target: number) {
  const length = end - start;
  const deviation = length - target;
  const tinyPenalty = length < DEFAULT_SEGMENT_MIN_WORD_LIMIT
    ? Math.pow(DEFAULT_SEGMENT_MIN_WORD_LIMIT - length, 2) * 40
    : 0;
  const longPenalty = length > DEFAULT_SEGMENT_SOFT_WORD_LIMIT ? (length - DEFAULT_SEGMENT_SOFT_WORD_LIMIT) * 12 : 0;
  return deviation * deviation + tinyPenalty + longPenalty;
}

function boundaryPenalty(value: string) {
  if (/[.!?][»"]?$/.test(value)) return -30;
  if (/[,;:][»"]?$/.test(value)) return 24;
  return 0;
}

function normalizeBoundaryWord(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function boundaryTransitionPenalty(tokens: Token[], end: number) {
  if (end <= 0 || end >= tokens.length) return 0;
  const previous = tokens[end - 1].value;
  const next = tokens[end].value;
  const normalizedNext = next.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  let penalty = 0;
  if (/[,;:][»"]?$/.test(previous)) penalty += 45;
  if (BAD_STARTINGS.has(normalizedNext)) penalty += 90;
  if (/^\p{Ll}/u.test(next)) penalty += 35;
  return penalty;
}

function boundaryContextPenalty(tokens: Token[], end: number) {
  const context = tokens.slice(Math.max(0, end - 5), end).map((token) => token.value).join(" ");
  return INCOMPLETE_ENDING_PATTERNS.some((pattern) => pattern.test(context)) ? 180 : 0;
}
