import {
  splitScriptIntoVoiceSegments,
  type VoiceSegment,
} from "./omni-script-segmentation";

export const OMNI_SEGMENT_SECONDS = 10;
export const OMNI_SPOKEN_WORDS_PER_SECOND = 2.8;

export const OMNI_MIN_SEGMENT_COUNT = 1;
export const OMNI_MAX_SEGMENT_COUNT = 4;
const OMNI_TARGET_SEGMENT_WORDS_MIN = 22;
const OMNI_TARGET_SEGMENT_WORDS_MAX = 27;

export type OmniReelSegmentPlan = {
  segmentCount: number;
  durationSeconds: number;
  wordCount: number;
  reason: string;
  segments: VoiceSegment[];
  segmentWordCounts: number[];
};

export function getOmniSegmentWordBudget(segmentSeconds = OMNI_SEGMENT_SECONDS) {
  return Math.floor(segmentSeconds * OMNI_SPOKEN_WORDS_PER_SECOND);
}

export function countOmniScriptWords(script: string) {
  return script.trim().split(/\s+/).filter(Boolean).length;
}

export function planOmniReelSegments(script: string): OmniReelSegmentPlan {
  const wordCount = countOmniScriptWords(script);
  const maxWordsPerSegment = getOmniSegmentWordBudget();
  const maxWords = OMNI_MAX_SEGMENT_COUNT * maxWordsPerSegment;
  if (wordCount > maxWords) {
    throw new Error(
      `Сценарий слишком длинный: ${wordCount} слов. Максимум ${maxWords} слов для 4 частей. Сократите сценарий.`
    );
  }
  if (wordCount < OMNI_MIN_SEGMENT_COUNT) {
    throw new Error("Сценарий слишком короткий: для видео нужно минимум 1 слово.");
  }

  const candidates = Array.from(
    { length: OMNI_MAX_SEGMENT_COUNT - OMNI_MIN_SEGMENT_COUNT + 1 },
    (_, index) => index + OMNI_MIN_SEGMENT_COUNT
  )
    .filter((segmentCount) => wordCount <= segmentCount * maxWordsPerSegment)
    .map((segmentCount) => buildCandidate(script, segmentCount, maxWordsPerSegment))
    .filter((candidate): candidate is PlanCandidate => candidate !== null);

  const selected = candidates.sort((left, right) => left.score - right.score)[0];
  if (!selected) {
    throw new Error("Не удалось разделить сценарий на 2-4 части без разрыва CTA. Измените формулировку сценария.");
  }

  return {
    segmentCount: selected.segments.length,
    durationSeconds: selected.segments.length * OMNI_SEGMENT_SECONDS,
    wordCount,
    reason: buildPlanReason(selected.segments),
    segments: selected.segments,
    segmentWordCounts: selected.segments.map((segment) => segment.wordCount),
  };
}

/** @deprecated Use planOmniReelSegments once and reuse its segments. */
export function planOmniReelDuration(script: string) {
  return planOmniReelSegments(script).durationSeconds;
}

type PlanCandidate = {
  segments: VoiceSegment[];
  score: number;
};

function buildCandidate(script: string, segmentCount: number, maxWordsPerSegment: number): PlanCandidate | null {
  try {
    const segments = splitScriptIntoVoiceSegments(script, segmentCount, maxWordsPerSegment);
    if (segments.length !== segmentCount) return null;
    return { segments, score: scoreSegments(segments) };
  } catch {
    return null;
  }
}

function scoreSegments(segments: VoiceSegment[]) {
  return segments.reduce((score, segment, index) => {
    const densityPenalty = segment.wordCount < OMNI_TARGET_SEGMENT_WORDS_MIN
      ? Math.pow(OMNI_TARGET_SEGMENT_WORDS_MIN - segment.wordCount, 2) * 8
      : segment.wordCount > OMNI_TARGET_SEGMENT_WORDS_MAX
        ? Math.pow(segment.wordCount - OMNI_TARGET_SEGMENT_WORDS_MAX, 2) * 1.2
        : 0;
    return score + densityPenalty + (index < segments.length - 1 ? endingPenalty(segment.text) : 0);
  }, 0);
}

function endingPenalty(text: string) {
  if (/[.!?][»"]?$/.test(text)) return -12;
  if (/[,;:][»"]?$/.test(text)) return -4;
  return 8;
}

function buildPlanReason(segments: VoiceSegment[]) {
  const counts = segments.map((segment) => segment.wordCount);
  const naturalBoundaryCount = segments
    .slice(0, -1)
    .filter((segment) => /[.!?,;:][»"]?$/.test(segment.text)).length;
  const density = counts.every((count) => count >= OMNI_TARGET_SEGMENT_WORDS_MIN && count <= OMNI_TARGET_SEGMENT_WORDS_MAX)
    ? "плотная речь без пауз"
    : "безопасная плотность речи";
  const boundaries = naturalBoundaryCount > 0 ? " и естественные границы фраз" : "";
  return `${segments.length} части: ${density}${boundaries}; ${counts.join(" / ")} слов`;
}
