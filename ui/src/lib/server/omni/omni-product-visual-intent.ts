import type { ProductRole } from "../../omni/creative-contract";
import {
  getOmniStoryboardFrameCount,
  isOmniStoryboardDuration,
} from "../../omni/storyboard/omni-storyboard-timing";
import { isOmniProductVisualBeat, mentionsOmniProduct } from "./omni-intro-product-contract";
import type { ReferenceSegmentPlan } from "./reference-segment-plan";
import { splitStoryboardSpeech } from "./storyboard/omni-storyboard-speech";

export type OmniProductVisualIntentPlan = {
  version: "product-visual-intent-v1";
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

  spokenTexts.forEach((text, index) => {
    if (!isOmniProductVisualBeat(text, input.productName) || visibleByFrame[index]) return;
    let end = index;
    while (end + 1 < frameCount) {
      if (!SENTENCE_END_PATTERN.test(spokenTexts[end]) || CONTINUATION_START_PATTERN.test(spokenTexts[end + 1])) {
        end += 1;
        continue;
      }
      break;
    }
    for (let frameIndex = index; frameIndex <= end; frameIndex += 1) visibleByFrame[frameIndex] = true;
  });

  const firstVisibleFrame = visibleByFrame.findIndex(Boolean);
  let lastVisibleIndex = -1;
  visibleByFrame.forEach((visible, index) => { if (visible) lastVisibleIndex = index; });
  return {
    version: "product-visual-intent-v1",
    mentionedByFrame,
    visibleByFrame,
    firstVisibleFrame: firstVisibleFrame >= 0 ? firstVisibleFrame + 1 : null,
    lastVisibleFrame: lastVisibleIndex >= 0 ? lastVisibleIndex + 1 : null,
  };
}

function emptyIntentPlan(): OmniProductVisualIntentPlan {
  return {
    version: "product-visual-intent-v1",
    mentionedByFrame: [],
    visibleByFrame: [],
    firstVisibleFrame: null,
    lastVisibleFrame: null,
  };
}

const SENTENCE_END_PATTERN = /[.!?…]+/u;
const CONTINUATION_START_PATTERN = /^(?:он|она|оно|они|этот|эта|это|так|такой|такая|его|ее|её|именно|поэтому|также|с\s+ним|с\s+ней|it|this|that|therefore)(?=\s|$|[,.!?])/iu;
