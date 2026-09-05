import type { CreativeSpeechSegment } from "./llm-prompt-chain-types";
import type { OmniDurationRange } from "./omni-duration-range";
import type { OmniReelSegmentPlan } from "./omni-duration-planner";
import { countOmniScriptWords } from "./omni-duration-planner";
import { analyzeOmniSpeechLoad } from "../../omni/storyboard/omni-speech-load";
import {
  OMNI_MIN_SEGMENT_COUNT, OMNI_MAX_SEGMENT_COUNT,
  getOmniSegmentDurationForWordCount, getOmniSegmentWordBudget, getOmniSegmentMinWords,
} from "./omni-speech-density";

/** Validate an already approved speech plan before it is reused. */
export function validateCreativeSpeechPlan(
  script: string, speechSegments: readonly CreativeSpeechSegment[], durationRange?: OmniDurationRange,
): OmniReelSegmentPlan {
  const issues: string[] = [];
  if (speechSegments.length < OMNI_MIN_SEGMENT_COUNT || speechSegments.length > OMNI_MAX_SEGMENT_COUNT) {
    issues.push(`Верни от ${OMNI_MIN_SEGMENT_COUNT} до ${OMNI_MAX_SEGMENT_COUNT} речевых segments; сейчас ${speechSegments.length}.`);
  }
  const joined = speechSegments.map((segment) => segment.voiceover.trim()).join(" ");
  if (normalizeSpaces(joined) !== normalizeSpaces(script)) {
    issues.push("Реплики segments должны составлять полный сценарий без пропусков, перестановок или добавленных слов.");
  }
  const segments = speechSegments.map((segment, index) => ({
    index: index + 1, text: segment.voiceover.trim(), wordCount: countOmniScriptWords(segment.voiceover),
  }));
  const durations = segments.map((segment, index) => {
    const duration = speechSegments[index].durationSeconds;
    const expected = getOmniSegmentDurationForWordCount(segment.wordCount);
    if (!expected) {
      issues.push(`Группа ${index + 1}: ${segment.wordCount} слов, указано ${duration} секунд. ` +
        "Переформулируй реплику для части 4/6/8/10 секунд." +
        ` Вместимость выбранной длительности: ${getOmniSegmentMinWords(duration)}-${getOmniSegmentWordBudget(duration)} слов; ориентир четыре слова на две секунды.`);
    }
    if (!/[.!?][»"”')]*$/u.test(segment.text)) {
      issues.push(`Группа ${index + 1} должна завершаться законченным предложением, а не обрывком фразы.`);
    }
    // The model owns text and boundaries; arithmetic belongs to code.
    return expected || 4;
  });
  if (issues.length) throw new Error(issues.join("\n"));
  return {
    segmentCount: segments.length,
    durationSeconds: durations.reduce((sum, duration) => sum + duration, 0),
    wordCount: segments.reduce((sum, segment) => sum + segment.wordCount, 0),
    reason: "Речевые границы автора проверены; ориентир четыре слова на две секунды.",
    segments, segmentDurationsSeconds: durations,
    segmentWordCounts: segments.map((segment) => segment.wordCount),
    speechDiagnostics: segments.map((segment, index) => analyzeOmniSpeechLoad(segment.text, durations[index])),
    durationRange,
  };
}

function normalizeSpaces(text: string) { return text.trim().replace(/\s+/gu, " "); }
