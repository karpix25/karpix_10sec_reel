import { mentionsOmniProduct } from "./omni-intro-product-contract";

export type ReferenceTransferMode = "full_reference" | "style_only";

export type ReferenceTransferDecision =
  | "preserve"
  | "replace_with_product"
  | "preserve_as_support"
  | "adapt_action"
  | "remove";

export type ReferenceTransferDecisions = {
  layout: ReferenceTransferDecision;
  camera: ReferenceTransferDecision;
  lighting: ReferenceTransferDecision;
  editLanguage: ReferenceTransferDecision;
  wardrobe: ReferenceTransferDecision;
  environment: ReferenceTransferDecision;
  presenterAction: ReferenceTransferDecision;
  sourceProduct: ReferenceTransferDecision;
  sourceProps: ReferenceTransferDecision;
  overlays: ReferenceTransferDecision;
};

export type ReferenceTransferPolicy = {
  version: "reference-transfer-v2";
  mode: ReferenceTransferMode;
  omitRawDirectorGuidance: boolean;
  decisions: ReferenceTransferDecisions;
};

export type ReferenceTransferFramePlan = {
  version: "reference-transfer-v2";
  productMeaningfulBeat: boolean;
  visualCue: string | null;
  decisions: ReferenceTransferDecisions;
};

export const DEFAULT_REFERENCE_TRANSFER_POLICY: ReferenceTransferPolicy = {
  version: "reference-transfer-v2",
  mode: "full_reference",
  omitRawDirectorGuidance: false,
  decisions: {
    layout: "preserve",
    camera: "preserve",
    lighting: "preserve",
    editLanguage: "preserve",
    wardrobe: "preserve",
    environment: "preserve",
    presenterAction: "adapt_action",
    sourceProduct: "replace_with_product",
    sourceProps: "preserve_as_support",
    overlays: "remove",
  },
};

/**
 * Keeps the reusable world of a reference (camera, clothes, place, rhythm),
 * while making product and prop decisions only after the new spoken beat is known.
 */
export function buildReferenceTransferPolicy(input: {
  hasProductReference: boolean;
}): ReferenceTransferPolicy {
  const productDecision: ReferenceTransferDecision = input.hasProductReference
    ? "replace_with_product"
    : "remove";

  return {
    ...DEFAULT_REFERENCE_TRANSFER_POLICY,
    // Retained for existing callers. Product category alone must not erase a
    // working reference situation such as a car, clothing, food, or a studio.
    mode: "full_reference",
    omitRawDirectorGuidance: false,
    decisions: { ...DEFAULT_REFERENCE_TRANSFER_POLICY.decisions, sourceProduct: productDecision },
  };
}

export function resolveReferenceTransferPolicy(policy: ReferenceTransferPolicy | null | undefined) {
  if (policy) return policy;
  return DEFAULT_REFERENCE_TRANSFER_POLICY;
}

export function buildReferenceTransferFramePlan(input: {
  policy: ReferenceTransferPolicy;
  spokenText: string;
  visualCue?: string | null;
  productName: string;
}): ReferenceTransferFramePlan {
  const productMeaningfulBeat = mentionsProduct(input.spokenText, input.productName);
  const visualCue = compactText(input.visualCue || "") || null;

  return {
    version: input.policy.version,
    productMeaningfulBeat,
    visualCue,
    decisions: {
      ...input.policy.decisions,
      // A source product is never allowed to leak into a non-product line.
      sourceProduct: productMeaningfulBeat
        ? input.policy.decisions.sourceProduct
        : "remove",
      // The reference action is adapted to the new line. Props can remain as
      // natural context, but may not become the subject of a different claim.
      presenterAction: "adapt_action",
    },
  };
}

export function resolveReferenceTransferAction(input: {
  framePlan: ReferenceTransferFramePlan;
  referenceAction: string;
  fallbackAction: string;
}) {
  const fallbackAction = compactText(input.fallbackAction);
  const referenceAction = compactText(input.referenceAction);
  const primaryAction = input.framePlan.visualCue || referenceAction || fallbackAction;
  const contextLine = referenceAction
    ? "сохраняет позу, ритм жеста и бытовой контекст reference, но действие подчинено текущей реплике"
    : "действие подчинено текущей реплике и сохраняет общий ритм reference";

  if (input.framePlan.productMeaningfulBeat) {
    return `${primaryAction}; ${contextLine}; исходный рекламный предмет заменен нашим продуктом`;
  }
  if (input.framePlan.visualCue) {
    return `${primaryAction}; ${contextLine}; исходный рекламный предмет вне кадра`;
  }
  return primaryAction || "персонаж естественно говорит в камеру в контексте reference";
}

function mentionsProduct(text: string, productName: string) {
  return Boolean(productName.trim()) && mentionsOmniProduct(text, productName);
}

function compactText(value: string) {
  const text = value.replace(/\s+/gu, " ").trim();
  if (text.length <= 220) return text;
  const clipped = text.slice(0, 220).replace(/\s+\S*$/u, "").trim();
  return clipped || text.slice(0, 220).trim();
}
