import {
  splitScriptIntoSentences,
  splitScriptIntoVoiceSegments,
  type VoiceSegment,
} from "./omni-script-segmentation";
import {
  OMNI_MAX_SEGMENT_COUNT,
  OMNI_MIN_SEGMENT_COUNT,
  OMNI_SEGMENT_SECONDS,
  OMNI_TARGET_SEGMENT_WORDS_MIN,
  describeOmniDensityGap,
  getOmniSegmentDurationForWordCount,
  getOmniSegmentDurationsForWordCount,
  getOmniMaxScriptWords,
  getOmniSegmentWordBudget,
  getPreferredOmniSegmentCount,
  isOmniSegmentCountViable,
  type OmniAllowedSegmentSeconds,
} from "./omni-speech-density";
import type { OmniDurationRange } from "./omni-duration-range";

export {
  OMNI_MAX_SEGMENT_COUNT,
  OMNI_MIN_SEGMENT_COUNT,
  OMNI_SEGMENT_SECONDS,
  getOmniMaxScriptWords,
  getOmniSegmentWordBudget,
};

export type OmniReelSegmentPlan = {
  segmentCount: number;
  durationSeconds: number;
  wordCount: number;
  reason: string;
  segments: VoiceSegment[];
  segmentDurationsSeconds: OmniAllowedSegmentSeconds[];
  segmentWordCounts: number[];
  durationRange?: OmniDurationRange;
};

export type OmniReelSegmentPlanOptions = {
  durationRange?: OmniDurationRange;
  requireSentenceBoundaries?: boolean;
};

export function countOmniScriptWords(script: string) {
  return script.trim().split(/\s+/).filter(Boolean).length;
}

export function planOmniReelSegments(script: string, options: OmniReelSegmentPlanOptions = {}): OmniReelSegmentPlan {
  const wordCount = countOmniScriptWords(script);
  const maxWordsPerSegment = getOmniSegmentWordBudget();
  if (wordCount < OMNI_MIN_SEGMENT_COUNT || !isAnySegmentCountViable(wordCount)) {
    throw new Error(describeOmniDensityGap(wordCount));
  }

  const maxCandidateSegmentCount = OMNI_MAX_SEGMENT_COUNT;
  const candidates = Array.from(
    { length: maxCandidateSegmentCount - OMNI_MIN_SEGMENT_COUNT + 1 },
    (_, index) => index + OMNI_MIN_SEGMENT_COUNT
  )
    .filter((segmentCount) => wordCount <= segmentCount * maxWordsPerSegment)
    .filter((segmentCount) => isOmniSegmentCountViable(wordCount, segmentCount))
    .map((segmentCount) => buildCandidate(
      script,
      segmentCount,
      maxWordsPerSegment,
      options.durationRange,
      options.requireSentenceBoundaries ?? false
    ))
    .filter((candidate): candidate is PlanCandidate => candidate !== null);

  const selected = candidates.sort((left, right) => left.score - right.score)[0];
  if (!selected) {
    throw new Error(buildPlanFailureMessage(script, wordCount, options.durationRange));
  }

  return {
    segmentCount: selected.segments.length,
    durationSeconds: selected.segmentDurationsSeconds.reduce((sum, seconds) => sum + seconds, 0),
    wordCount,
    reason: buildPlanReason(selected.segments, selected.segmentDurationsSeconds, options.durationRange),
    segments: selected.segments,
    segmentDurationsSeconds: selected.segmentDurationsSeconds,
    segmentWordCounts: selected.segments.map((segment) => segment.wordCount),
    durationRange: options.durationRange,
  };
}

/** @deprecated Use planOmniReelSegments once and reuse its segments. */
export function planOmniReelDuration(script: string) {
  return planOmniReelSegments(script).durationSeconds;
}

type PlanCandidate = {
  segments: VoiceSegment[];
  segmentDurationsSeconds: OmniAllowedSegmentSeconds[];
  score: number;
};

function buildCandidate(
  script: string,
  segmentCount: number,
  maxWordsPerSegment: number,
  durationRange: OmniDurationRange | undefined,
  requireSentenceBoundaries: boolean
): PlanCandidate | null {
  if (requireSentenceBoundaries) {
    return buildSentenceAwareCandidate(script, segmentCount, durationRange);
  }

  for (const allowAwkwardBoundaries of [false, true]) {
    for (const targetWordCounts of findTargetWordCountOptions(countOmniScriptWords(script), segmentCount)) {
      try {
        const segments = splitScriptIntoVoiceSegments(
          script,
          segmentCount,
          maxWordsPerSegment,
          OMNI_TARGET_SEGMENT_WORDS_MIN,
          (wordCount) => getOmniSegmentDurationForWordCount(wordCount) !== null,
          targetWordCounts,
          allowAwkwardBoundaries,
          requireSentenceBoundaries
        );
        if (segments.length !== segmentCount) continue;
        const segmentDurationsSeconds = resolveSegmentDurations(segments, durationRange);
        if (!segmentDurationsSeconds) continue;
        return {
          segments,
          segmentDurationsSeconds,
          score: scoreSegments(segments, segmentDurationsSeconds, durationRange) + (allowAwkwardBoundaries ? 500 : 0),
        };
      } catch {
        continue;
      }
    }
  }
  return null;
}

function buildSentenceAwareCandidate(
  script: string,
  segmentCount: number,
  durationRange?: OmniDurationRange
): PlanCandidate | null {
  const sentences = splitScriptIntoSentences(script);
  if (sentences.length < segmentCount) return null;

  const candidates: PlanCandidate[] = [];
  function visit(startSentence: number, remainingSegments: number, groups: VoiceSegment[]) {
    if (remainingSegments === 0) {
      if (startSentence !== sentences.length) return;
      const segmentDurationsSeconds = groups.map((segment) => getOmniSegmentDurationForWordCount(segment.wordCount));
      if (segmentDurationsSeconds.some((duration): duration is null => duration === null)) return;
      const durations = segmentDurationsSeconds as OmniAllowedSegmentSeconds[];
      candidates.push({
        segments: groups,
        segmentDurationsSeconds: durations,
        score: scoreSegments(groups, durations, durationRange),
      });
      return;
    }

    const lastStartSentence = sentences.length - remainingSegments;
    for (let endSentence = startSentence; endSentence <= lastStartSentence; endSentence += 1) {
      const segmentSentences = sentences.slice(startSentence, endSentence + 1);
      const text = segmentSentences.map((sentence) => sentence.text).join(" ");
      const wordCount = segmentSentences.reduce((sum, sentence) => sum + sentence.wordCount, 0);
      if (!getOmniSegmentDurationForWordCount(wordCount)) continue;
      visit(endSentence + 1, remainingSegments - 1, [
        ...groups,
        { index: groups.length + 1, text, wordCount },
      ]);
    }
  }

  visit(0, segmentCount, []);
  return candidates.sort((left, right) => left.score - right.score)[0] || null;
}

function findTargetWordCountOptions(wordCount: number, segmentCount: number): number[][] {
  const minimumWords = OMNI_TARGET_SEGMENT_WORDS_MIN;
  const maximumWords = getOmniSegmentWordBudget();
  const baseWords = Math.floor(wordCount / segmentCount);
  const remainder = wordCount % segmentCount;
  const option = Array.from({ length: segmentCount }, (_, index) => baseWords + (index < remainder ? 1 : 0));
  return option.every((count) => count >= minimumWords && count <= maximumWords)
    ? [option]
    : [];
}

function isAnySegmentCountViable(wordCount: number) {
  return getPreferredOmniSegmentCount(wordCount) !== null;
}

function resolveSegmentDurations(segments: VoiceSegment[], durationRange?: OmniDurationRange) {
  const options = segments.map((segment) => getOmniSegmentDurationsForWordCount(segment.wordCount));
  if (options.some((item) => item.length === 0)) return null;
  let bestDurations: OmniAllowedSegmentSeconds[] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  function visit(index: number, durations: OmniAllowedSegmentSeconds[]) {
    if (index === options.length) {
      const total = durations.reduce((sum, duration) => sum + duration, 0);
      const rangePenalty = getDurationRangePenalty(total, durationRange);
      const shortestPenalty = durationRange ? 0 : total;
      const score = rangePenalty + shortestPenalty;
      if (score < bestScore) {
        bestDurations = durations;
        bestScore = score;
      }
      return;
    }
    for (const duration of options[index]) {
      visit(index + 1, [...durations, duration]);
    }
  }

  visit(0, []);
  return bestDurations;
}

function buildPlanFailureMessage(script: string, wordCount: number, durationRange?: OmniDurationRange) {
  const sentenceWordCounts = splitScriptIntoSentences(script).map((sentence) => sentence.wordCount);
  const durationRule = durationRange
    ? `Текст на ${wordCount} слов нельзя разложить на 2-5 последовательных частей 4/6/8/10 секунд с завершенными предложениями. Диапазон ${durationRange.minSeconds}-${durationRange.maxSeconds} секунд используется как ориентир, а не как причина отказа.`
    : "Каждая часть должна укладываться в лимит слов и заканчиваться завершенным предложением без разрыва CTA.";
  return [
    `Не удалось разделить сценарий на части 4/6/8/10 секунд: ${durationRule}`,
    sentenceWordCounts.length
      ? `Длины предложений по порядку: ${sentenceWordCounts.join(", ")} слов. Каждое предложение должно быть не длиннее двадцати слов, а короткие предложения нужно объединять с соседними в один segment.`
      : "",
    "Сохраните смысл, но сократите второстепенные детали или объедините короткие фразы в законченные предложения. Измените формулировку сценария.",
  ].filter(Boolean).join(" ");
}

function scoreSegments(
  segments: VoiceSegment[],
  durations: readonly OmniAllowedSegmentSeconds[],
  durationRange?: OmniDurationRange
) {
  const segmentCountPenalty = segments.length * 36;
  const totalDuration = durations.reduce((sum, duration) => sum + duration, 0);
  const durationRangePenalty = getDurationRangePenalty(totalDuration, durationRange);
  return segmentCountPenalty + durationRangePenalty + segments.reduce((score, segment, index) => {
    const duration = durations[index] || OMNI_SEGMENT_SECONDS;
    const budget = getOmniSegmentWordBudget(duration);
    const segmentBudget = budget;
    const densityRatio = segment.wordCount / segmentBudget;
    const sparsePenalty = densityRatio < 0.72 ? Math.pow((0.72 - densityRatio) * 10, 2) : 0;
    const overflowPenalty = segment.wordCount > segmentBudget ? Math.pow(segment.wordCount - segmentBudget, 2) * 20 : 0;
    const durationPenalty = duration * 0.5;
    return score + sparsePenalty + overflowPenalty + durationPenalty + (index < segments.length - 1 ? endingPenalty(segment.text) : 0);
  }, 0);
}

function getDurationRangePenalty(totalDuration: number, durationRange?: OmniDurationRange) {
  if (!durationRange) return 0;
  if (totalDuration < durationRange.minSeconds) {
    return Math.pow(durationRange.minSeconds - totalDuration, 2) * 100;
  }
  if (totalDuration > durationRange.maxSeconds) {
    return Math.pow(totalDuration - durationRange.maxSeconds, 2) * 100;
  }
  return 0;
}

function endingPenalty(text: string) {
  if (/[.!?][»"]?$/.test(text)) return -12;
  if (/[,;:][»"]?$/.test(text)) return -4;
  return 8;
}

function buildPlanReason(
  segments: VoiceSegment[],
  durations: readonly OmniAllowedSegmentSeconds[],
  durationRange?: OmniDurationRange
) {
  const counts = segments.map((segment) => segment.wordCount);
  const durationText = durations.map((duration) => `${duration}с`).join(" / ");
  const naturalBoundaryCount = segments
    .slice(0, -1)
    .filter((segment) => /[.!?,;:][»"]?$/.test(segment.text)).length;
  const density = counts.every((count, index) => {
    const budget = getOmniSegmentWordBudget(durations[index] || OMNI_SEGMENT_SECONDS);
    return count >= OMNI_TARGET_SEGMENT_WORDS_MIN && count <= budget;
  }) ? "плотная речь без пауз" : "безопасная плотность речи";
  const boundaries = naturalBoundaryCount > 0 ? " и естественные границы фраз" : "";
  const target = durationRange ? `; цель ${durationRange.minSeconds}-${durationRange.maxSeconds}с` : "";
  return `${segments.length} части: ${density}${boundaries}; ${counts.join(" / ")} слов; длительности ${durationText}${target}`;
}
