import { isOmniProductVisualBeat, mentionsOmniProduct } from "./omni-intro-product-contract";

export type OmniSegmentSourceSpan = {
  startSeconds: number;
  endSeconds: number;
};

export type OmniSegmentIntentInput = {
  index?: number;
  text?: string;
  spokenText?: string;
  sourceIndex?: number;
  sourceSpan?: Readonly<OmniSegmentSourceSpan>;
};

export type OmniSegmentIntent = {
  index: number;
  spokenText: string;
  productMentioned: boolean;
  productVisible: boolean;
  sourceIndex?: number;
  sourceSpan?: OmniSegmentSourceSpan;
};

/**
 * Derives visual intent from the final spoken line only.
 * Never add productName to spokenText before calling this helper.
 */
export function deriveOmniSegmentIntents(
  segments: readonly OmniSegmentIntentInput[],
  productName: string
): OmniSegmentIntent[] {
  return segments.map((segment, offset) => {
    const spokenText = cleanText(segment.spokenText ?? segment.text);
    const sourceSpan = normalizeSourceSpan(segment.sourceSpan);
    const sourceIndex = positiveInteger(segment.sourceIndex);
    const productMentioned = Boolean(productName.trim()) && mentionsOmniProduct(spokenText, productName);

    return {
      index: positiveInteger(segment.index) || offset + 1,
      spokenText,
      productMentioned,
      productVisible: productMentioned && isOmniProductVisualBeat(spokenText, productName),
      ...(sourceIndex ? { sourceIndex } : {}),
      ...(sourceSpan ? { sourceSpan } : {}),
    };
  });
}

function cleanText(value: string | undefined) {
  return (value || "").replace(/\s+/gu, " ").trim();
}

function positiveInteger(value: number | undefined) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0;
}

function normalizeSourceSpan(value: Readonly<OmniSegmentSourceSpan> | undefined) {
  if (!value || !Number.isFinite(value.startSeconds) || !Number.isFinite(value.endSeconds)) return undefined;
  if (value.startSeconds < 0 || value.endSeconds < value.startSeconds) return undefined;
  return { startSeconds: value.startSeconds, endSeconds: value.endSeconds };
}
