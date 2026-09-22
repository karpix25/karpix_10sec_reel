import { isOmniProductVisualBeat, mentionsOmniProduct } from "./omni-intro-product-contract";
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
      const productMentioned = mentionsOmniProduct(chunk.text, input.productName);
      const productVisible = isOmniProductVisualBeat(chunk.text, input.productName);
      const isFirstFrame = frameOffset === 0;
      const isLastFrame = segmentOffset === input.segments.length - 1 && frameOffset === chunks.length - 1;
      const stage = isLastFrame ? "cta" : productVisible ? "product" : segmentOffset === 0 && isFirstFrame ? "hook" : "body";
      items.push({
        id: `segment_${segment.index}_frame_${frameOffset + 1}`,
        segmentIndex: segment.index,
        frameIndex: frameOffset + 1,
        startSeconds: frameOffset * 2,
        endSeconds: (frameOffset + 1) * 2,
        spokenWords: chunk.text,
        stage,
        productMentioned,
        visualRole: productVisible ? "product" : isFirstFrame ? "avatar" : "avatar_or_environment",
        visualInstruction: productVisible
          ? "Показать только наш продукт отдельной предметной перебивкой; без рук и человека."
          : isFirstFrame
            ? "Начать с сохранённого аватара, который ведёт повествование."
            : "Подобрать визуальное действие под смысл этих слов, сохраняя механику референса.",
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
    stage: item.stage,
    product_mentioned: item.productMentioned,
    visual_role: item.visualRole,
    visual_instruction: item.visualInstruction,
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
