import {
  splitScriptIntoVoiceSegments,
  type VoiceSegment,
} from "./omni-script-segmentation";
import {
  OMNI_MAX_SEGMENT_COUNT,
  OMNI_MIN_SEGMENT_COUNT,
  OMNI_SEGMENT_SECONDS,
  OMNI_ALLOWED_SEGMENT_SECONDS,
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
import { getOmniStoryboardTailWordCount } from "../../omni/storyboard/omni-storyboard-timing";

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
    throw new Error(buildPlanFailureMessage(wordCount, options.durationRange));
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

function findTargetWordCountOptions(wordCount: number, segmentCount: number): number[][] {
  const tailWords = getOmniStoryboardTailWordCount(wordCount);
  const baseWordCount = wordCount - tailWords;
  const segmentWordCounts = [...OMNI_ALLOWED_SEGMENT_SECONDS]
    .map((seconds) => getOmniSegmentWordBudget(seconds))
    .sort((left, right) => right - left);
  const options: number[][] = [];

  function visit(remainingWords: number, remainingSegments: number, prefix: number[]) {
    if (remainingSegments === 0) {
      if (remainingWords === 0) options.push(prefix);
      return;
    }
    if (
      remainingWords < remainingSegments * segmentWordCounts[segmentWordCounts.length - 1] ||
      remainingWords > remainingSegments * segmentWordCounts[0]
    ) return;

    for (const segmentWords of segmentWordCounts) {
      visit(remainingWords - segmentWords, remainingSegments - 1, [...prefix, segmentWords]);
    }
  }

  visit(baseWordCount, segmentCount, []);
  return options.map((option) => {
    if (!tailWords) return option;
    const lastIndex = option.length - 1;
    return [...option.slice(0, lastIndex), option[lastIndex] + tailWords];
  });
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
      if (durationRange && (total < durationRange.minSeconds || total > durationRange.maxSeconds)) return;
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

function buildPlanFailureMessage(wordCount: number, durationRange?: OmniDurationRange) {
  const durationRule = durationRange
    ? `Текст на ${wordCount} слов нельзя упаковать в заданные ${durationRange.minSeconds}-${durationRange.maxSeconds} секунд с допустимыми частями 4/6/8/10 секунд.`
    : "Каждая часть должна укладываться в лимит слов и заканчиваться завершенным предложением без разрыва CTA.";
  return [
    `Не удалось разделить сценарий на части 4/6/8/10 секунд: ${durationRule}`,
    "Сохраните смысл, но сократите второстепенные детали или объедините короткие фразы в законченные предложения. Измените формулировку сценария.",
  ].join(" ");
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
    const segmentBudget = budget + getOmniStoryboardTailWordCount(segment.wordCount);
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
    return count >= OMNI_TARGET_SEGMENT_WORDS_MIN && count <= budget + getOmniStoryboardTailWordCount(count);
  }) ? "плотная речь без пауз" : "безопасная плотность речи";
  const boundaries = naturalBoundaryCount > 0 ? " и естественные границы фраз" : "";
  const target = durationRange ? `; цель ${durationRange.minSeconds}-${durationRange.maxSeconds}с` : "";
  return `${segments.length} части: ${density}${boundaries}; ${counts.join(" / ")} слов; длительности ${durationText}${target}`;
}
