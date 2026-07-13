import type { OmniClientAvatar, OmniGeneratedScript, OmniProduct, OmniReferenceAsset } from "@/lib/omni/types";
import {
  buildReelVisualWorld,
  buildSegmentContinuityLine,
  buildSegmentShotPlan,
  buildSegmentStoryGoal,
  OMNI_MOBILE_UGC_STYLE,
} from "./omni-ugc-contract";

export type OmniSegmentPrompt = {
  index: number;
  role: string;
  prompt: string;
  referenceUrl: string | null;
  voiceoverText: string;
};

type BuildOmniPromptsInput = {
  generatedScript: OmniGeneratedScript | null;
  legacyTranscript: string | null;
  product: OmniProduct;
  avatar: OmniClientAvatar | null;
  segmentCount: number;
  segmentSeconds: number;
  brief: string | null;
};

export const OMNI_PROMPT_WRITER_SYSTEM_PROMPT = `
You are an expert prompt writer for Google Omni video generation through KIE.
Your job is to transform a Reels script into stitch-friendly 10-second vertical smartphone UGC prompts.
Each prompt must preserve product identity, one scenario-specific creator environment, one continuous phone-shot reel, and a fictional presenter with a consistent general type.
Write prompts as production-ready positive instructions for a photorealistic 9:16 phone video model.
`.trim();

export function buildOmniSegmentPrompts(input: BuildOmniPromptsInput): OmniSegmentPrompt[] {
  const scriptText = input.generatedScript?.script || input.legacyTranscript || input.brief || "";
  const chunks = splitScriptIntoChunks(scriptText, input.segmentCount);
  const productReference = getPrimaryReference(input.product.product_refs);
  const avatarReference = input.avatar?.reference_url || null;

  return Array.from({ length: input.segmentCount }, (_, index) => {
    const segmentIndex = index + 1;
    const role = getSegmentRole(segmentIndex, input.segmentCount);
    const scriptChunk = chunks[index] || "";
    const referenceUrl = segmentIndex === 1 ? avatarReference : productReference?.url || avatarReference || null;

    return {
      index: segmentIndex,
      role,
      referenceUrl,
      voiceoverText: scriptChunk,
      prompt: buildSinglePrompt({
        segmentIndex,
        segmentCount: input.segmentCount,
        segmentSeconds: input.segmentSeconds,
        role,
        scriptChunk,
        fullScript: scriptText,
        brief: input.brief,
        product: input.product,
        productReference,
        avatar: input.avatar,
        avatarReference,
      }),
    };
  });
}

function buildSinglePrompt(input: {
  segmentIndex: number;
  segmentCount: number;
  segmentSeconds: number;
  role: string;
  scriptChunk: string;
  fullScript: string;
  brief: string | null;
  product: OmniProduct;
  productReference: OmniReferenceAsset | null;
  avatar: OmniClientAvatar | null;
  avatarReference: string | null;
}) {
  const visualWorld = buildReelVisualWorld(input.fullScript || input.brief || input.scriptChunk, input.product);
  const continuity = buildSegmentContinuityLine(input.segmentIndex, input.segmentCount, visualWorld);
  const storyGoal = buildSegmentStoryGoal(input.segmentIndex, input.segmentCount, visualWorld);
  const shotPlan = buildSegmentShotPlan(input.segmentIndex, input.segmentCount, visualWorld);
  const productReveal = buildProductRevealGuidance(input.segmentIndex, input.segmentCount);
  const productReferenceContext = input.productReference
    ? buildProductReferenceContext(input.segmentIndex)
    : "not provided";
  const ending =
    input.segmentIndex === input.segmentCount
      ? "End with a relaxed CTA-friendly closing pose in the same creator environment."
      : "End mid-motion or with a natural beat that can stitch into the next 10-second segment.";
  const voiceover = input.scriptChunk || "Use one short natural Russian sentence that fits this segment's story goal.";

  return [
    OMNI_PROMPT_WRITER_SYSTEM_PROMPT,
    "",
    `SEGMENT: ${input.segmentIndex}/${input.segmentCount}`,
    `DURATION: exactly ${input.segmentSeconds} seconds`,
    "FORMAT: vertical 9:16, photorealistic smartphone UGC video",
    `ROLE: ${input.role}`,
    "",
    "MOBILE UGC STYLE:",
    OMNI_MOBILE_UGC_STYLE,
    "",
    "SCENARIO VISUAL WORLD:",
    visualWorld.setting,
    "",
    "CONTINUITY:",
    continuity,
    "",
    "SEGMENT STORY GOAL:",
    storyGoal,
    "",
    "SHOT PLAN:",
    shotPlan,
    "",
    "SCRIPT BEAT TO VISUALIZE:",
    voiceover,
    "",
    "SPOKEN AUDIO / VOICEOVER:",
    `Say only this segment text in natural Russian speech: ${voiceover}`,
    "",
    "FULL REEL CONTEXT FOR CONTINUITY ONLY:",
    input.fullScript || input.brief || "No full script context provided.",
    "",
    "PRODUCT CONTEXT:",
    `Product name: ${input.product.name}`,
    `Product description: ${input.product.description || "not provided"}`,
    `Product notes: ${input.product.product_reference_notes || "not provided"}`,
    `Product reference image: ${productReferenceContext}`,
    "",
    "AVATAR CONTEXT:",
    `Avatar prompt: ${input.avatar?.prompt || "not provided"}`,
    `Avatar reference image: ${input.avatarReference ? "attached separately with the API request as a loose moodboard for a privacy-safe fictional UGC presenter" : "not provided"}`,
    "",
    "VISUAL RULES:",
    productReveal,
    input.segmentIndex === 1
      ? "- Build curiosity with the presenter, the real setting, a glass, spoon, shelf, sink, or hand gesture; save the package reveal for the next segment."
      : "- Treat the product reference as the primary visual reference when it is attached; preserve package shape, color palette, label direction, and product form factor.",
    "- Keep a consistent fictional presenter type across segments: similar age range, hair color, outfit palette, mood, and speaking style.",
    "- Treat the avatar reference only as secondary presenter moodboard when present; never let it override product identity.",
    "- Keep the exact physical location chosen in the first segment, plus lighting, background logic, and phone-camera language, consistent across all segments.",
    "- Use 2-3 natural shot changes inside this 10-second segment without changing the scene: direct-to-camera, hands, object close-up, POV, mirror, over-the-shoulder, phone-on-counter, phone-on-shelf, small walk within the same location, desk detail, or product-adjacent angle.",
    "- Keep inserts grounded in the same physical setup and visual world; do not reset into a new studio, new room, new street, or unrelated ad scene.",
    "- Make the first 3 seconds visually specific and curiosity-driven, with movement or an unusual close-up that feels like real phone footage.",
    "- Use natural speech, natural face movement, realistic hands, and everyday product handling.",
    "- Use one physically possible camera setup per beat: handheld phone, phone resting on a counter or shelf, mirror angle, small tripod, or another person filming.",
    "- Stage product handling as a clear sequence: set phone stable, place glass on counter, pick up package, open it, scoop or pour, stir, then return to a selfie reaction.",
    "- During mixing or pouring, keep the glass and package on the counter or in separate hands with a stable camera view; make each hand perform one clear action at a time.",
    "- Keep action simple enough for a clean 10-second Omni generation.",
    input.segmentIndex === 1
      ? "- Let the product enter the story as anticipation through routine objects and body language; keep the package reveal for part 2."
      : "- Show the product naturally in frame or as the visual anchor, especially during the middle and final segment.",
    "- For talking-head beats, keep the avatar looking into camera with natural gestures.",
    "- The spoken words in this segment belong only to this segment, while the visual identity stays part of one continuous reel.",
    `- Shot plan: ${shotPlan}`,
    `- Continuity: ${continuity}`,
    `- Ending: ${ending}`,
    input.brief ? `- Extra brief: ${input.brief}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function splitScriptIntoChunks(script: string, count: number) {
  const normalized = script.replace(/\s+/g, " ").trim();
  const totalWords = countWords(normalized);
  const targetWords = Math.max(8, Math.ceil(totalWords / count));
  const sentenceUnits = normalized.match(/[^.!?]+[.!?]*/g)?.map((part) => part.trim()).filter(Boolean) || [];
  const units = sentenceUnits.length >= count ? sentenceUnits : splitWordsIntoUnits(normalized, targetWords);
  if (!units.length) return [];

  const chunks = Array.from({ length: count }, () => [] as string[]);
  let chunkIndex = 0;
  let chunkWords = 0;

  for (const unit of units) {
    const unitWords = countWords(unit);
    const hasRoom = chunkWords === 0 || chunkWords + unitWords <= targetWords || chunkIndex === count - 1;
    if (!hasRoom) {
      chunkIndex = Math.min(chunkIndex + 1, count - 1);
      chunkWords = 0;
    }
    chunks[chunkIndex].push(unit);
    chunkWords += unitWords;
  }

  return chunks.map((chunk) => chunk.join(" ").trim()).filter(Boolean);
}

function buildProductReferenceContext(segmentIndex: number) {
  if (segmentIndex === 1) {
    return "reserved for later segments; start with presenter and routine context, then reveal the package in part 2";
  }
  return "attached as the primary visual reference for this segment; keep the package, color, form factor, and label direction consistent when shown";
}

function buildProductRevealGuidance(segmentIndex: number, segmentCount: number) {
  if (segmentIndex === 1) {
    return "- Segment 1 is the pre-reveal hook: focus on the presenter, phone movement, and routine setup; make the viewer want to see what appears next.";
  }
  if (segmentIndex === segmentCount) {
    return "- Segment 3 is the payoff: show the product naturally on the counter or in one hand, then finish with a calm creator reaction.";
  }
  return "- Segment 2 is the product reveal: introduce the product package clearly in the same setting and connect it to the routine.";
}

function countWords(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

function splitWordsIntoUnits(text: string, targetWords: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const units: string[] = [];
  for (let index = 0; index < words.length; index += targetWords) {
    units.push(words.slice(index, index + targetWords).join(" "));
  }
  return units;
}

function getPrimaryReference(refs: OmniReferenceAsset[]) {
  return refs.find((ref) => ref.is_primary && ref.kind === "image") || refs.find((ref) => ref.kind === "image") || null;
}

function getSegmentRole(index: number, total: number) {
  if (index === 1) return "hook";
  if (index === total) return "cta_or_payoff";
  return "body";
}
