import { splitStoryboardSpeechWithBoundaries } from "./storyboard/omni-storyboard-speech";
import { getOmniStoryboardFrameCount } from "../../omni/storyboard/omni-storyboard-timing";
import type { DirectorSegmentPlan, OmniBeatSheet, OmniBeatSheetItem } from "./llm-prompt-chain-types";

export function buildOmniBeatSheet(input: {
  segments: readonly { index: number; durationSeconds: number; voiceover: string }[];
  productName: string;
}): OmniBeatSheet {
  const items: OmniBeatSheetItem[] = [];
  input.segments.forEach((segment, segmentOffset) => {
    const frameCount = getOmniStoryboardFrameCount(segment.durationSeconds);
    if (!frameCount) throw new Error(`Cannot build beat sheet for segment ${segment.index}`);
    const chunks = splitStoryboardSpeechWithBoundaries(segment.voiceover, frameCount);
    if (chunks.length !== frameCount) throw new Error(`Beat sheet speech split failed for segment ${segment.index}`);
    chunks.forEach((chunk, frameOffset) => {
      const isFirstFrame = frameOffset === 0;
      const isLastFrame = segmentOffset === input.segments.length - 1 && frameOffset === chunks.length - 1;
      const stage = isLastFrame ? "cta" : segmentOffset === 0 && isFirstFrame ? "hook" : "body";
      items.push({
        id: `segment_${segment.index}_frame_${frameOffset + 1}`,
        segmentIndex: segment.index,
        frameIndex: frameOffset + 1,
        startSeconds: frameOffset * 2,
        endSeconds: (frameOffset + 1) * 2,
        spokenWords: chunk.text,
        stage,
        productMentioned: false,
        visualRole: isFirstFrame ? "avatar" : "avatar_or_environment",
        visualInstruction: isFirstFrame
          ? "Начать с сохранённого аватара. Смысл и визуальную роль бита определяет режиссёрская LLM."
          : "Определить смысл и визуальную роль бита по полной фразе и контексту сценария.",
      });
    });
  });
  return { version: "omni-beat-sheet-v1", items };
}

export function renderOmniBeatSheetForPrompt(sheet: OmniBeatSheet) {
  return JSON.stringify(sheet.items.map((item) => ({
    id: item.id,
    segment_index: item.segmentIndex,
    frame_index: item.frameIndex,
    time: `${item.startSeconds}-${item.endSeconds} seconds`,
    spoken_words: item.spokenWords,
    timeline_hint: item.stage,
    semantic_assignment: "LLM_MUST_DECIDE_FROM_CONTEXT",
  })), null, 2);
}

export function validateOmniBeatSheetAlignment(plan: DirectorSegmentPlan, sheet: OmniBeatSheet) {
  const issues: string[] = [];
  const expected = sheet.items;
  const actual = plan.segments.flatMap((segment) => segment.storyboardFrames.map((frame) => ({
    segmentIndex: segment.index,
    frameIndex: frame.index,
    spokenWords: frame.spokenWords,
  })));
  if (actual.length !== expected.length) {
    issues.push(`Beat sheet has ${expected.length} rows but storyboard has ${actual.length} frames`);
    return issues;
  }
  expected.forEach((beat, index) => {
    const frame = actual[index];
    if (frame.segmentIndex !== beat.segmentIndex || frame.frameIndex !== beat.frameIndex || normalize(frame.spokenWords) !== normalize(beat.spokenWords)) {
      issues.push(`${beat.id} does not match the approved speech row`);
    }
  });
  return issues;
}

function normalize(value: string) {
  return value.trim().replace(/\s+/gu, " ");
}
