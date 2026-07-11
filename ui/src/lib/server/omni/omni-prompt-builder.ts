import type { OmniClientAvatar, OmniGeneratedScript, OmniProduct, OmniReferenceAsset } from "@/lib/omni/types";

export type OmniSegmentPrompt = {
  index: number;
  role: string;
  prompt: string;
  referenceUrl: string | null;
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
Your job is to transform a Reels script into stitch-friendly 10-second vertical video prompts.
Each prompt must preserve avatar identity, product identity, visual continuity, and the real UGC format of the source reference.
Never invent a different product, package, logo, material, or avatar face when references are provided.
Write prompts as production-ready instructions for a photorealistic 9:16 mobile video model.
`.trim();

export function buildOmniSegmentPrompts(input: BuildOmniPromptsInput): OmniSegmentPrompt[] {
  const scriptText = input.generatedScript?.script || input.legacyTranscript || input.brief || "";
  const chunks = splitScriptIntoChunks(scriptText, input.segmentCount);
  const productReference = getPrimaryReference(input.product.product_refs);
  const avatarReference = input.avatar?.reference_url || null;

  return Array.from({ length: input.segmentCount }, (_, index) => {
    const segmentIndex = index + 1;
    const role = getSegmentRole(segmentIndex, input.segmentCount);
    const scriptChunk = chunks[index] || chunks[chunks.length - 1] || scriptText;
    const referenceUrl = productReference?.url || avatarReference;

    return {
      index: segmentIndex,
      role,
      referenceUrl,
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
  const continuity =
    input.segmentIndex === 1
      ? "Open with a strong first-frame hook. Leave motion direction easy to continue."
      : "Continue visual identity from the previous segment. Avoid a hard reset unless the script clearly changes scene.";
  const ending =
    input.segmentIndex === input.segmentCount
      ? "End with a clear visual payoff or CTA-friendly closing pose."
      : "End mid-motion or with a natural beat that can stitch into the next 10-second segment.";

  return [
    OMNI_PROMPT_WRITER_SYSTEM_PROMPT,
    "",
    `SEGMENT: ${input.segmentIndex}/${input.segmentCount}`,
    `DURATION: exactly ${input.segmentSeconds} seconds`,
    "FORMAT: vertical 9:16, photorealistic high-end smartphone UGC video",
    `ROLE: ${input.role}`,
    "",
    "SCRIPT BEAT TO VISUALIZE:",
    input.scriptChunk || input.fullScript || "No script text provided. Build a clear product-focused visual beat.",
    "",
    "PRODUCT CONTEXT:",
    `Product name: ${input.product.name}`,
    `Product description: ${input.product.description || "not provided"}`,
    `Product notes: ${input.product.product_reference_notes || "not provided"}`,
    `Product reference image: ${input.productReference?.url || "not provided"}`,
    "",
    "AVATAR CONTEXT:",
    `Avatar prompt: ${input.avatar?.prompt || "not provided"}`,
    `Avatar reference: ${input.avatarReference || "not provided"}`,
    "",
    "VISUAL RULES:",
    "- Preserve the exact product identity from product references.",
    "- Preserve the same avatar identity, wardrobe logic, lighting family, and camera language across all segments.",
    "- Do not add text overlays, subtitles, captions, UI, logos, watermarks, or extra hands unless explicitly needed.",
    "- Keep action simple enough for a clean 10-second Omni generation.",
    "- If product reference exists, show the product naturally in frame or as the visual anchor.",
    "- If this is a talking-head beat, keep the avatar looking into camera with natural gestures.",
    `- Continuity: ${continuity}`,
    `- Ending: ${ending}`,
    input.brief ? `- Extra brief: ${input.brief}` : null,
    "",
    "NEGATIVE PROMPT:",
    "cartoon, CGI, plastic skin, distorted hands, unreadable labels, wrong product packaging, duplicated product, extra fingers, warped face, flicker, subtitles, watermark, on-screen text, low resolution",
  ]
    .filter(Boolean)
    .join("\n");
}

function splitScriptIntoChunks(script: string, count: number) {
  const lines = script
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const units = lines.length ? lines : script.match(/[^.!?]+[.!?]*/g)?.map((part) => part.trim()).filter(Boolean) || [];
  if (!units.length) return [];

  const chunks: string[] = [];
  const perChunk = Math.max(1, Math.ceil(units.length / count));
  for (let index = 0; index < count; index += 1) {
    chunks.push(units.slice(index * perChunk, (index + 1) * perChunk).join("\n"));
  }
  return chunks;
}

function getPrimaryReference(refs: OmniReferenceAsset[]) {
  return refs.find((ref) => ref.is_primary && ref.kind === "image") || refs.find((ref) => ref.kind === "image") || null;
}

function getSegmentRole(index: number, total: number) {
  if (index === 1) return "hook";
  if (index === total) return "cta_or_payoff";
  return "body";
}
