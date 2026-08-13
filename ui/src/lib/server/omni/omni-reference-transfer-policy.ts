import { mentionsOmniProduct } from "./omni-intro-product-contract";
import type { OmniStoryboardReferenceTransfer } from "../../omni/storyboard/omni-storyboard-types";
import type { DirectorBrief, DirectorVisualTransferContract } from "./director-analysis-types";

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
  version: "reference-transfer-v2" | "reference-transfer-v3";
  mode: ReferenceTransferMode;
  omitRawDirectorGuidance: boolean;
  decisions: ReferenceTransferDecisions;
  visualContract: ReferenceVisualTransferContract;
};

export type ReferenceVisualTransferContract = {
  cameraComposition: string | null;
  persistentSupportProps: readonly string[];
  actionBeats: readonly { timestampSeconds: number; action: string; requiredProp: string | null }[];
};

export type ReferenceTransferFramePlan = {
  version: "reference-transfer-v2" | "reference-transfer-v3";
  productMentioned: boolean;
  productMeaningfulBeat: boolean;
  visualCue: string | null;
  cameraComposition: string | null;
  requiredSupportProps: readonly string[];
  requiredReferenceAction: string | null;
  decisions: ReferenceTransferDecisions;
};

export const DEFAULT_REFERENCE_TRANSFER_POLICY: ReferenceTransferPolicy = {
  version: "reference-transfer-v3",
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
  visualContract: {
    cameraComposition: null,
    persistentSupportProps: [],
    actionBeats: [],
  },
};

/**
 * Keeps the reusable world of a reference (camera, clothes, place, rhythm),
 * while making product and prop decisions only after the new spoken beat is known.
 */
export function buildReferenceTransferPolicy(input: {
  hasProductReference: boolean;
  directorBrief?: DirectorBrief | null;
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
    visualContract: buildReferenceVisualTransferContract(input.directorBrief),
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
  productVisible?: boolean;
  position?: number;
}): ReferenceTransferFramePlan {
  const productMentioned = mentionsProduct(input.spokenText, input.productName);
  const productMeaningfulBeat = input.productVisible ?? productMentioned;
  const visualCue = compactText(input.visualCue || "") || null;
  const referenceBeat = selectReferenceBeat(input.policy.visualContract, input.position);

  return {
    version: input.policy.version,
    productMentioned,
    productMeaningfulBeat,
    visualCue,
    cameraComposition: input.policy.visualContract.cameraComposition,
    requiredSupportProps: uniqueCompact([
      ...input.policy.visualContract.persistentSupportProps,
      referenceBeat?.requiredProp || "",
    ]),
    requiredReferenceAction: referenceBeat?.action || null,
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

/** Keeps the product replacement decision aligned after deterministic storyboard repair. */
export function synchronizeReferenceTransferProductVisibility(
  framePlan: OmniStoryboardReferenceTransfer | null | undefined,
  productVisible: boolean
): OmniStoryboardReferenceTransfer | null {
  if (!framePlan) return null;
  return {
    ...framePlan,
    productMentioned: framePlan.productMentioned ?? framePlan.productMeaningfulBeat,
    productMeaningfulBeat: productVisible,
    cameraComposition: framePlan.cameraComposition || null,
    requiredSupportProps: framePlan.requiredSupportProps || [],
    requiredReferenceAction: framePlan.requiredReferenceAction || null,
    decisions: {
      ...framePlan.decisions,
      sourceProduct: productVisible ? framePlan.decisions.sourceProduct : "remove",
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
  const primaryAction = input.framePlan.productMeaningfulBeat
    ? input.framePlan.visualCue || input.framePlan.requiredReferenceAction || referenceAction || fallbackAction
    : input.framePlan.visualCue || input.framePlan.requiredReferenceAction || referenceAction || fallbackAction;
  const contextLine = referenceAction
    ? "сохраняет позу, ритм жеста и бытовой контекст reference, но действие подчинено текущей реплике"
    : "действие подчинено текущей реплике и сохраняет общий ритм reference";

  if (input.framePlan.productMeaningfulBeat) {
    return `${primaryAction}; ${contextLine}; исходный рекламный предмет заменен нашим продуктом`;
  }
  if (input.framePlan.visualCue || input.framePlan.requiredReferenceAction) {
    return `${primaryAction}; ${contextLine}; исходный рекламный предмет вне кадра`;
  }
  return primaryAction || "персонаж естественно говорит в камеру в контексте reference";
}

export function hasRequiredReferenceSupport(framePlan: OmniStoryboardReferenceTransfer | null | undefined) {
  return Boolean(framePlan?.requiredSupportProps?.length);
}

export function renderRequiredReferenceSupport(framePlan: OmniStoryboardReferenceTransfer | null | undefined) {
  const props = framePlan?.requiredSupportProps || [];
  return props.length
    ? `обязательный нейтральный реквизит reference: ${props.join("; ")}`
    : "";
}

function buildReferenceVisualTransferContract(brief?: DirectorBrief | null): ReferenceVisualTransferContract {
  const explicit = brief?.visual_transfer;
  const fallbackProps = (brief?.prop_sources || [])
    .filter((item) => !/(?:^|\s)(?:no|not|none|нет|не\s+(?:показан|виден|введен|введён))/iu.test(item))
    .slice(0, 4)
    .map((description) => ({ description, visible_from_start: /(?:already|start|с\s+начала|в\s+начале)/iu.test(description) }));
  const source: DirectorVisualTransferContract = explicit || {
    camera_composition: brief?.visual_hook.action || "",
    props: fallbackProps.map((prop) => ({ role: "support_prop" as const, ...prop })),
    action_beats: (brief?.action_beats || []).map((beat) => ({
      timestamp_sec: beat.timestamp_sec,
      action: [beat.action_description, beat.actor_gesture].filter(Boolean).join("; "),
    })),
  };
  const persistentSupportProps = uniqueCompact(
    source.props
      .filter((prop) => (prop.role === "proof_prop" || prop.role === "support_prop") && prop.visible_from_start)
      .map((prop) => prop.description)
  );
  const sourceProductProps = source.props
    .filter((prop) => prop.role === "source_product")
    .map((prop) => prop.description);
  return {
    cameraComposition: compactText(source.camera_composition || "") || null,
    persistentSupportProps,
    actionBeats: source.action_beats
      .filter((beat) => !referencesSourceProduct(beat.required_prop || beat.action, sourceProductProps))
      .map((beat) => ({
        timestampSeconds: Math.max(0, Number(beat.timestamp_sec) || 0),
        action: compactText(beat.action),
        requiredProp: compactText(beat.required_prop || "") || null,
      }))
      .filter((beat) => Boolean(beat.action)),
  };
}

function referencesSourceProduct(value: string | undefined, sourceProductProps: readonly string[]) {
  const marker = productPackageMarker(value || "");
  return Boolean(marker) && sourceProductProps.some((prop) => productPackageMarker(prop) === marker);
}

function productPackageMarker(value: string) {
  return value.toLocaleLowerCase().match(/\b(?:product|branded)\s+(?:box|package|packaging|bottle|jar|tube|stick(?:\s+pack)?)\b/u)?.[0] || "";
}

function selectReferenceBeat(contract: ReferenceVisualTransferContract, position = 0) {
  if (!contract.actionBeats.length) return null;
  const maxTimestamp = Math.max(...contract.actionBeats.map((beat) => beat.timestampSeconds), 1);
  const target = Math.max(0, Math.min(1, position)) * maxTimestamp;
  return contract.actionBeats.reduce((best, beat) =>
    Math.abs(beat.timestampSeconds - target) < Math.abs(best.timestampSeconds - target) ? beat : best
  );
}

function uniqueCompact(values: readonly string[]) {
  const seen = new Set<string>();
  return values
    .map((value) => compactText(value))
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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
