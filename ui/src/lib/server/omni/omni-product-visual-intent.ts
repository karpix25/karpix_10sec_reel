import type { ProductRole } from "../../omni/creative-contract";
import {
  getOmniStoryboardFrameCount,
  isOmniStoryboardDuration,
} from "../../omni/storyboard/omni-storyboard-timing";
import { isOmniProductVisualBeat, mentionsOmniProduct } from "./omni-intro-product-contract";
import type { ReferenceSegmentPlan } from "./reference-segment-plan";
import { splitStoryboardSpeechWithBoundaries } from "./storyboard/omni-storyboard-speech";

export type OmniProductVisualIntentPlan = {
  version: "product-visual-intent-v3-single-time-window";
  mentionedByFrame: readonly boolean[];
  visibleByFrame: readonly boolean[];
  firstVisibleFrame: number | null;
  lastVisibleFrame: number | null;
};

export function buildOmniProductVisualIntent(input: {
  voiceoverText: string;
  durationSeconds: number;
  productName: string;
  productRole?: ProductRole;
  referenceSegmentPlan?: ReferenceSegmentPlan | null;
}): OmniProductVisualIntentPlan {
  const frameCount = getOmniStoryboardFrameCount(input.durationSeconds) || 0;
  if (!frameCount || !isOmniStoryboardDuration(input.durationSeconds)) {
    return emptyIntentPlan();
  }
  if (input.productRole === "hidden") return emptyIntentPlan();

  const speechChunks = splitStoryboardSpeechWithBoundaries(input.voiceoverText, frameCount);
  const spokenTexts = speechChunks.map((chunk) => chunk.text);
  const mentionedByFrame = spokenTexts.map((text) => mentionsOmniProduct(text, input.productName));
  const visibleByFrame = Array.from({ length: frameCount }, () => false);

  const productSpeechSpan = findFirstProductSpeechSpan(input.voiceoverText, input.productName);
  if (productSpeechSpan) {
    speechChunks.forEach((chunk, index) => {
      if (chunk.startWord < productSpeechSpan.endWord && chunk.endWord > productSpeechSpan.startWord) {
        visibleByFrame[index] = true;
      }
    });
  } else {
    const productFrameIndex = spokenTexts.findIndex((text) => isOmniProductVisualBeat(text, input.productName));
    if (productFrameIndex >= 0) visibleByFrame[productFrameIndex] = true;
  }

  const firstVisibleFrame = visibleByFrame.findIndex(Boolean);
  let lastVisibleIndex = -1;
  visibleByFrame.forEach((visible, index) => { if (visible) lastVisibleIndex = index; });
  return {
    version: "product-visual-intent-v3-single-time-window",
    mentionedByFrame,
    visibleByFrame,
    firstVisibleFrame: firstVisibleFrame >= 0 ? firstVisibleFrame + 1 : null,
    lastVisibleFrame: lastVisibleIndex >= 0 ? lastVisibleIndex + 1 : null,
  };
}

function emptyIntentPlan(): OmniProductVisualIntentPlan {
  return {
    version: "product-visual-intent-v3-single-time-window",
    mentionedByFrame: [],
    visibleByFrame: [],
    firstVisibleFrame: null,
    lastVisibleFrame: null,
  };
}

function findFirstProductSpeechSpan(text: string, productName: string) {
  const words = text.trim().split(/\s+/u).filter(Boolean);
  let startWord = 0;
  for (let index = 0; index < words.length; index += 1) {
    const sentenceEnded = /[.!?…]+$/u.test(words[index] || "");
    if (!sentenceEnded && index < words.length - 1) continue;
    const endWord = index + 1;
    const sentence = words.slice(startWord, endWord).join(" ");
    if (isOmniProductVisualBeat(sentence, productName) || mentionsOmniProduct(sentence, productName)) {
      return { startWord, endWord };
    }
    startWord = endWord;
  }
  return null;
}
