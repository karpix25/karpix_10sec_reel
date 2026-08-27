import {
  OMNI_STORYBOARD_MIN_FRAME_WORDS,
  getOmniStoryboardFrameWordCounts,
  getOmniStoryboardFrameCount,
} from "../../../omni/storyboard/omni-storyboard-types";
import type { StoryboardFrame } from "../llm-prompt-chain-types";

export type StoryboardSpeechChunk = {
  text: string;
  startWord: number;
  endWord: number;
  boundary: "sentence" | "segment_end" | "continuation";
};

export function splitStoryboardSpeech(text: string, frameCount: number) {
  const chunks = splitStoryboardSpeechWithBoundaries(text, frameCount);
  return chunks.map((chunk) => chunk.text);
}

export function splitStoryboardSpeechWithBoundaries(text: string, frameCount: number): StoryboardSpeechChunk[] {
  const words = text.trim().split(/\s+/u).filter(Boolean);
  const frameWordCounts = getOmniStoryboardFrameWordCounts(words.length, frameCount * 2);
  if (frameCount < 1 || !frameWordCounts) return [];
  const chunks: StoryboardSpeechChunk[] = [];
  let cursor = 0;
  for (let index = 0; index < frameCount; index += 1) {
    const size = frameWordCounts[index] || OMNI_STORYBOARD_MIN_FRAME_WORDS;
    const endWord = cursor + size;
    const previous = words[endWord - 1] || "";
    chunks.push({
      text: words.slice(cursor, endWord).join(" "),
      startWord: cursor,
      endWord,
      boundary: SENTENCE_END_PATTERN.test(previous)
        ? "sentence"
        : endWord >= words.length
          ? "segment_end"
          : "continuation",
    });
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

const SENTENCE_END_PATTERN = /[.!?…]+$/u;
