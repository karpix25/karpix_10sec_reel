import type { OmniGeneratedScript, OmniProduct, OmniReferenceAsset } from "@/lib/omni/types";
import type { OmniCreativeStrategy, OmniSegmentCreativePlan, ProductRole } from "@/lib/omni/creative-contract";
import { isOmniProductVisualBeat, mentionsExplicitOmniProduct } from "./omni-intro-product-contract";
import {
  buildProductVisualProfileFromText,
  extractProductVisualProfileFromSnapshot,
  normalizeProductVisualProfile,
} from "./product-visual-profile";

export function buildStoredCreativePlan(input: {
  segmentIndex: number;
  segmentCount: number;
  voiceoverText: string;
  productRole: ProductRole;
  segmentSeconds: number;
  productVisibleByFrame?: readonly boolean[];
  strategy: OmniCreativeStrategy & { referenceSceneMode?: string };
}): OmniSegmentCreativePlan {
  const middleStart = roundOne(Math.max(1, input.segmentSeconds * 0.55));
  const middleEnd = roundOne(Math.min(input.segmentSeconds - 1, input.segmentSeconds * 0.75));
  return {
    segmentIndex: input.segmentIndex,
    lifeFormatId: input.strategy.lifeFormatId,
    speechStartsAtSeconds: 0,
    voiceoverText: input.voiceoverText,
    productRole: input.productRole,
    productVisibleByFrame: input.productVisibleByFrame,
    continuityProps: input.strategy.continuityProps,
    referenceSceneMode: input.strategy.referenceSceneMode,
    beats: [
      { startSeconds: 0, endSeconds: middleStart, action: "LLM storyboard opening" },
      { startSeconds: middleStart, endSeconds: middleEnd, action: "LLM storyboard middle beat" },
      { startSeconds: middleEnd, endSeconds: input.segmentSeconds, action: "LLM storyboard closing beat" },
    ],
  };
}

export function selectReferenceUrl(
  role: ProductRole,
  avatarReference: string | null,
  productReference: OmniReferenceAsset | null,
  referenceSceneMode: string,
) {
  if (role === "hidden") return referenceSceneMode === "presenter" ? avatarReference : null;
  return productReference?.url || (referenceSceneMode === "presenter" ? avatarReference : null);
}

export function getPrimaryReference(refs: OmniReferenceAsset[]) {
  return refs.find((ref) => ref.is_primary && ref.kind === "image") || refs.find((ref) => ref.kind === "image") || null;
}

export function getSegmentRole(index: number, total: number) {
  if (index === 1) return "hook";
  if (index === total) return "cta_or_payoff";
  return "body";
}

export function selectPhysicalProductDemoSegmentIndex(input: {
  segments: readonly { index: number; spokenText: string }[];
  productName: string;
  productRole: ProductRole;
}) {
  if (input.productRole === "hidden") return null;
  const explicit = input.segments.find((segment) => mentionsExplicitOmniProduct(segment.spokenText, input.productName));
  if (explicit) return explicit.index;
  return input.segments.find((segment) => isOmniProductVisualBeat(segment.spokenText, input.productName))?.index || null;
}

export function resolvePhysicalProductDemoRole(
  segmentIndex: number,
  productDemoSegmentIndex: number | null,
  selectedRole: ProductRole = "brief_demo",
  forceVisible = false,
): ProductRole {
  if (selectedRole === "hidden") return "hidden";
  if (forceVisible) return selectedRole === "digital_demo" ? "digital_demo" : "background_prop";
  if (segmentIndex !== productDemoSegmentIndex) return "hidden";
  return selectedRole === "digital_demo" ? "digital_demo" : "background_prop";
}

export function resolveProductVisualProfile(input: {
  product: OmniProduct;
  generatedScript: OmniGeneratedScript | null;
}) {
  return (
    normalizeProductVisualProfile(input.product.product_visual_profile) ||
    extractProductVisualProfileFromSnapshot(input.generatedScript?.product_snapshot) ||
    buildProductVisualProfileFromText({
      description: input.product.description,
      notes: input.product.product_reference_notes,
    })
  );
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}
