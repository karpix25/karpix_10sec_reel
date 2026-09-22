import type { ProductRole } from "../../omni/creative-contract";
import {
  getOmniStoryboardFrameCount,
  isOmniStoryboardDuration,
} from "../../omni/storyboard/omni-storyboard-timing";
import { isOmniProductVisualBeat, mentionsOmniProduct } from "./omni-intro-product-contract";
import type { ReferenceSegmentPlan } from "./reference-segment-plan";
import { splitStoryboardSpeech } from "./storyboard/omni-storyboard-speech";

export type OmniProductVisualIntentPlan = {
  version: "product-visual-intent-v2-single-shot";
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

  const spokenTexts = splitStoryboardSpeech(input.voiceoverText, frameCount);
  const mentionedByFrame = spokenTexts.map((text) => mentionsOmniProduct(text, input.productName));
  const visibleByFrame = Array.from({ length: frameCount }, () => false);

  const productFrameIndex = spokenTexts.findIndex((text) => isOmniProductVisualBeat(text, input.productName));
  if (productFrameIndex >= 0) visibleByFrame[productFrameIndex] = true;

  const firstVisibleFrame = visibleByFrame.findIndex(Boolean);
  let lastVisibleIndex = -1;
  visibleByFrame.forEach((visible, index) => { if (visible) lastVisibleIndex = index; });
  return {
    version: "product-visual-intent-v2-single-shot",
    mentionedByFrame,
    visibleByFrame,
    firstVisibleFrame: firstVisibleFrame >= 0 ? firstVisibleFrame + 1 : null,
    lastVisibleFrame: lastVisibleIndex >= 0 ? lastVisibleIndex + 1 : null,
  };
}

function emptyIntentPlan(): OmniProductVisualIntentPlan {
  return {
    version: "product-visual-intent-v2-single-shot",
    mentionedByFrame: [],
    visibleByFrame: [],
    firstVisibleFrame: null,
    lastVisibleFrame: null,
  };
}
