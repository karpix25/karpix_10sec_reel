import type { OmniClientAvatar, OmniGeneratedScript, OmniProduct, OmniReferenceAsset } from "@/lib/omni/types";
import { buildSegmentContinuityLine, buildSegmentStoryGoal, OMNI_MOBILE_UGC_STYLE } from "./omni-ugc-contract";

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
Each prompt must preserve product identity, one lived-in home setting, one continuous mobile-shot reel, and a fictional presenter with a consistent general type.
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
    const referenceUrl = avatarReference || productReference?.url || null;

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
  const continuity = buildSegmentContinuityLine(input.segmentIndex, input.segmentCount);
  const storyGoal = buildSegmentStoryGoal(input.segmentIndex, input.segmentCount);
  const ending =
    input.segmentIndex === input.segmentCount
      ? "End with a relaxed CTA-friendly closing pose in the same home scene."
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
    "CONTINUITY:",
    continuity,
    "",
    "SEGMENT STORY GOAL:",
    storyGoal,
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
    `Product reference image: ${input.productReference ? "attached separately with the API request" : "not provided"}`,
    "",
    "AVATAR CONTEXT:",
    `Avatar prompt: ${input.avatar?.prompt || "not provided"}`,
    `Avatar reference image: ${input.avatarReference ? "attached separately with the API request as a loose moodboard for a privacy-safe fictional UGC presenter" : "not provided"}`,
    "",
    "VISUAL RULES:",
    "- Keep the exact product identity from product references when they are visible.",
    "- Keep a consistent fictional presenter type across segments: similar age range, hair color, outfit palette, mood, and speaking style.",
    "- Treat the avatar reference as inspiration for a privacy-safe fictional presenter with a similar general vibe.",
    "- Keep lighting, room, and phone-camera language consistent across all segments.",
    "- Use natural speech, natural face movement, realistic hands, and everyday product handling.",
    "- Keep action simple enough for a clean 10-second Omni generation.",
    "- Show the product naturally in frame or as the visual anchor when a product reference exists.",
    "- For talking-head beats, keep the avatar looking into camera with natural gestures.",
    "- The spoken words in this segment belong only to this segment, while the visual identity stays part of one continuous reel.",
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
