import {
  OMNI_STORYBOARD_MAX_FRAME_WORDS,
  OMNI_STORYBOARD_MIN_FRAME_WORDS,
  getOmniStoryboardFrameCount,
} from "../../../omni/storyboard/omni-storyboard-types";
import type { StoryboardFrame } from "../llm-prompt-chain-types";

export function splitStoryboardSpeech(text: string, frameCount: number) {
  const words = text.trim().split(/\s+/u).filter(Boolean);
  const chunks: string[] = [];
  let cursor = 0;
  for (let index = 0; index < frameCount; index += 1) {
    const remainingFrames = frameCount - index;
    const remainingWords = words.length - cursor;
    const candidates = [];
    for (let size = OMNI_STORYBOARD_MIN_FRAME_WORDS; size <= OMNI_STORYBOARD_MAX_FRAME_WORDS; size += 1) {
      const nextRemaining = remainingWords - size;
      if (nextRemaining < (remainingFrames - 1) * OMNI_STORYBOARD_MIN_FRAME_WORDS) continue;
      if (nextRemaining > (remainingFrames - 1) * OMNI_STORYBOARD_MAX_FRAME_WORDS) continue;
      candidates.push({ size, score: boundaryScore(words, cursor, size) });
    }
    const selected = candidates.sort((left, right) => right.score - left.score || left.size - right.size)[0];
    const size = selected?.size || Math.min(OMNI_STORYBOARD_MAX_FRAME_WORDS, remainingWords);
    chunks.push(words.slice(cursor, cursor + size).join(" "));
    cursor += size;
  }
  return chunks;
}

export function alignStoryboardFramesToVoiceover(input: {
  frames: readonly StoryboardFrame[];
  voiceoverText: string;
  durationSeconds: number;
}) {
  const frameCount = getOmniStoryboardFrameCount(input.durationSeconds);
  if (!frameCount || input.frames.length !== frameCount) return input.frames;
  const spokenChunks = splitStoryboardSpeech(input.voiceoverText, frameCount);
  return input.frames.map((frame, index) => ({
    ...frame,
    spokenWords: spokenChunks[index] || frame.spokenWords,
  }));
}

function boundaryScore(words: readonly string[], cursor: number, size: number) {
  const previous = words[cursor + size - 1] || "";
  const next = words[cursor + size] || "";
  let score = 0;
  if (/[.!?]$/u.test(previous)) score += 8;
  else if (/[,:;]$/u.test(previous)) score += 3;
  if (BAD_END_PATTERN.test(previous)) score -= 20;
  if (BAD_START_PATTERN.test(next)) score -= 5;
  return score;
}

const BAD_END_PATTERN = /^(?:и|а|но|что|в|на|по|для|из|к|с|у|это|вот|наш|наша|этот|эта|мой|моя)$/iu;
const BAD_START_PATTERN = /^(?:и|а|но|что|в|на|по|для|из|к|с|у|это|вот|наш|наша|этот|эта|мой|моя)$/iu;
