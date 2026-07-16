import {
  splitScriptIntoVoiceSegments,
  type VoiceSegment,
} from "./omni-script-segmentation";
import {
  OMNI_MAX_SEGMENT_COUNT,
  OMNI_MIN_SEGMENT_COUNT,
  OMNI_SEGMENT_SECONDS,
  OMNI_TARGET_SEGMENT_WORDS_MAX,
  OMNI_TARGET_SEGMENT_WORDS_MIN,
  describeOmniDensityGap,
  getOmniSegmentDurationForWordCount,
  getOmniMaxScriptWords,
  getOmniSegmentWordBudget,
  isOmniSegmentCountViable,
  type OmniAllowedSegmentSeconds,
} from "./omni-speech-density";
import type { OmniDurationRange } from "./omni-duration-range";

export {
  OMNI_MAX_SEGMENT_COUNT,
  OMNI_MIN_SEGMENT_COUNT,
  OMNI_SEGMENT_SECONDS,
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

export function countOmniScriptWords(script: string) {
  return script.trim().split(/\s+/).filter(Boolean).length;
}

export function planOmniReelSegments(script: string, options: {
  durationRange?: OmniDurationRange;
} = {}): OmniReelSegmentPlan {
  const wordCount = countOmniScriptWords(script);
  const maxWordsPerSegment = getOmniSegmentWordBudget();
  const maxWords = getOmniMaxScriptWords();
  if (wordCount > maxWords) {
    throw new Error(
      `Сценарий слишком длинный: ${wordCount} слов. Максимум ${maxWords} слов для 4 частей. Сократите сценарий.`
    );
  }
  if (wordCount < OMNI_MIN_SEGMENT_COUNT || !isAnySegmentCountViable(wordCount)) {
    throw new Error(describeOmniDensityGap(wordCount));
  }

  const candidates = Array.from(
    { length: OMNI_MAX_SEGMENT_COUNT - OMNI_MIN_SEGMENT_COUNT + 1 },
    (_, index) => index + OMNI_MIN_SEGMENT_COUNT
  )
    .filter((segmentCount) => wordCount <= segmentCount * maxWordsPerSegment)
    .filter((segmentCount) => isOmniSegmentCountViable(wordCount, segmentCount))
    .map((segmentCount) => buildCandidate(script, segmentCount, maxWordsPerSegment, options.durationRange))
    .filter((candidate): candidate is PlanCandidate => candidate !== null);

  const selected = candidates.sort((left, right) => left.score - right.score)[0];
  if (!selected) {
    throw new Error("Не удалось разделить сценарий на части 4/6/8/10 секунд без разрыва CTA. Измените формулировку сценария.");
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
  durationRange?: OmniDurationRange
): PlanCandidate | null {
  try {
    const segments = splitScriptIntoVoiceSegments(script, segmentCount, maxWordsPerSegment);
    if (segments.length !== segmentCount) return null;
    const segmentDurationsSeconds = resolveSegmentDurations(segments);
    if (!segmentDurationsSeconds) return null;
    return {
      segments,
      segmentDurationsSeconds,
      score: scoreSegments(segments, segmentDurationsSeconds, durationRange),
    };
  } catch {
    return null;
  }
}

function isAnySegmentCountViable(wordCount: number) {
  for (let segmentCount = OMNI_MIN_SEGMENT_COUNT; segmentCount <= OMNI_MAX_SEGMENT_COUNT; segmentCount += 1) {
    if (isOmniSegmentCountViable(wordCount, segmentCount)) return true;
  }
  return false;
}

function resolveSegmentDurations(segments: VoiceSegment[]) {
  const durations = segments.map((segment) => getOmniSegmentDurationForWordCount(segment.wordCount));
  return durations.every(Boolean) ? (durations as OmniAllowedSegmentSeconds[]) : null;
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
    const densityRatio = segment.wordCount / budget;
    const sparsePenalty = densityRatio < 0.72 ? Math.pow((0.72 - densityRatio) * 10, 2) : 0;
    const overflowPenalty = segment.wordCount > budget ? Math.pow(segment.wordCount - budget, 2) * 20 : 0;
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
