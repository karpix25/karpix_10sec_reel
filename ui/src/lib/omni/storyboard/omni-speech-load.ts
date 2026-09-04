import {
  getOmniStoryboardFrameWordCounts,
  getOmniStoryboardFrameCount,
  OMNI_STORYBOARD_TARGET_FRAME_WORDS,
} from "./omni-storyboard-timing";

export type OmniSpeechLoad = {
  wordCount: number;
  targetWords: number | null;
  missingTargetWords: number | null;
  approximateRussianSyllables: number;
  pauseMarkCount: number;
  ellipsisCount: number;
  pronunciationUncertainWords: string[];
  longestWords: { word: string; approximateRussianSyllables: number }[];
  frames: {
    wordCount: number;
    missingTargetWords: number;
    approximateRussianSyllables: number;
    pauseMarkCount: number;
  }[];
};

export function analyzeOmniSpeechLoad(text: string, durationSeconds: number): OmniSpeechLoad {
  const words = text.trim().split(/\s+/u).filter(Boolean);
  const frameCount = getOmniStoryboardFrameCount(durationSeconds);
  const counts = getOmniStoryboardFrameWordCounts(words.length, durationSeconds) || [];
  const targetWords = frameCount ? frameCount * OMNI_STORYBOARD_TARGET_FRAME_WORDS : null;
  let cursor = 0;
  const frames = counts.map((wordCount) => {
    const frameText = words.slice(cursor, cursor + wordCount).join(" ");
    cursor += wordCount;
    return {
      wordCount,
      missingTargetWords: OMNI_STORYBOARD_TARGET_FRAME_WORDS - wordCount,
      approximateRussianSyllables: countRussianSyllables(frameText),
      pauseMarkCount: countPauseMarks(frameText),
    };
  });
  return {
    wordCount: words.length,
    targetWords,
    missingTargetWords: targetWords === null ? null : Math.max(0, targetWords - words.length),
    approximateRussianSyllables: countRussianSyllables(text),
    pauseMarkCount: countPauseMarks(text),
    ellipsisCount: (text.match(/…|\.{3,}/gu) || []).length,
    pronunciationUncertainWords: [...new Set(words.filter((word) => /[a-z\d]/iu.test(word) || /[А-ЯЁ]{2,}/u.test(word)))],
    longestWords: [...new Set(words)].map((word) => ({
      word,
      approximateRussianSyllables: countRussianSyllables(word),
    })).sort((left, right) => right.approximateRussianSyllables - left.approximateRussianSyllables).slice(0, 3),
    frames,
  };
}

// ponytail: Russian vowel counts describe relative load, not speaking seconds.
// Calibrate against delivered speech before using them as acceptance thresholds.
function countRussianSyllables(text: string) {
  return (text.match(/[аеёиоуыэюя]/giu) || []).length;
}

function countPauseMarks(text: string) {
  return (text.match(/[.,;:!?…]+/gu) || []).length;
}
