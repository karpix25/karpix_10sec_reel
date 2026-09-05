import type { OmniSegmentCreativePlan, ProductRole } from "@/lib/omni/creative-contract";
import { compactPromptPhrase } from "./omni-scene-world-sanitizer";
import type { ReferenceFormatMode } from "./omni-reference-format-mode";
import type { DirectorWardrobeContinuity } from "./director-wardrobe";
import type { ReferenceTransferPolicy } from "./omni-reference-transfer-policy";
import type { ReferenceSegmentPlan } from "./reference-segment-plan";
import { buildProductBrollAction, buildProductBrollPlacement, OMNI_PRODUCT_BROLL_RULE } from "./omni-product-broll-contract";

export type OmniGenerationContinuityState = {
  segmentIndex: number;
  productState: string;
  sceneState: string;
  lastAction: string;
};

export type OmniGenerationContinuityDirection = {
  promptLines: string[];
  nextState: OmniGenerationContinuityState;
};

type BuildContinuityDirectionInput = {
  plan: OmniSegmentCreativePlan;
  productName: string;
  segmentIndex: number;
  segmentCount: number;
  previousState: OmniGenerationContinuityState | null;
  talkingHead: boolean;
  referenceFormatMode?: ReferenceFormatMode;
  wardrobeContinuity?: DirectorWardrobeContinuity;
  referencePolicy?: Pick<ReferenceTransferPolicy, "mode">;
  referenceSegmentPlan?: ReferenceSegmentPlan | null;
};

export function buildOmniGenerationContinuityDirection(
  input: BuildContinuityDirectionInput
): OmniGenerationContinuityDirection {
  const montageReference = input.referenceFormatMode === "voiceover_montage";
  const voiceoverBrollReference = input.plan.referenceSceneMode === "voiceover_broll";
  const productVisible = input.plan.productVisibleByFrame?.some(Boolean) ?? input.plan.productRole !== "hidden";
  const productAction = buildProductAction({
    productName: input.productName,
    role: input.plan.productRole,
    productVisible,
    segmentIndex: input.segmentIndex,
    segmentCount: input.segmentCount,
    previousProductState: montageReference ? null : input.previousState?.productState || null,
    talkingHead: input.talkingHead,
    voiceoverBroll: voiceoverBrollReference,
  });
  const sceneStart = montageReference
    ? "start this independent cut from the current storyboard"
    : input.previousState
      ? "continue directly from the previous segment final state"
      : "start at the first storyboard panel";
  const wardrobeInstruction = renderWardrobeContinuityInstruction(input.wardrobeContinuity);
  const productContinuity = !productVisible
    ? "Product stays off camera."
    : "The product appears only in approved storyboard product B-roll panels. Outside those panels it stays off camera; preserve one identity and stable surface within the approved panels.";
  const nextState: OmniGenerationContinuityState = {
    segmentIndex: input.segmentIndex,
    productState: compactContinuityState(productAction.endState),
    sceneState: describeSceneEnd(input.plan, productAction.endState),
    lastAction: compactContinuityState(input.plan.beats[2]?.action || productAction.actionLine),
  };

  return {
    promptLines: montageReference
      ? [
        `MONTAGE: ${sceneStart}. The current storyboard controls location, camera, wardrobe, action, and cuts. ${wardrobeInstruction}`,
        `PRODUCT CONTINUITY: ${productContinuity}`,
      ]
      : [
        `CONTINUITY: ${sceneStart}. The current storyboard controls location, camera, wardrobe, action, and cuts. ${wardrobeInstruction}`,
        `PRODUCT CONTINUITY: ${productContinuity}`,
      ],
    nextState,
  };
}

function renderWardrobeContinuityInstruction(continuity?: DirectorWardrobeContinuity) {
  if (continuity === "stable") return "Keep the exact analyzed outfit across this continuous subject.";
  if (continuity === "changes_between_cuts") return "Use the outfit from the current analyzed source interval; outfit changes between cuts are intentional.";
  if (continuity === "not_visible") return "Do not invent clothing details that are not visible.";
  return "Follow the current storyboard wardrobe and do not infer a global outfit lock from the montage format.";
}

function buildProductAction(input: {
  productName: string;
  role: ProductRole;
  productVisible: boolean;
  segmentIndex: number;
  segmentCount: number;
  previousProductState: string | null;
  talkingHead: boolean;
  voiceoverBroll: boolean;
}) {
  const product = input.productName || "the product";
  if (!input.productVisible || input.role === "hidden") {
    return {
      actionLine: `${product} stays outside the frame; do not introduce it as an image or overlay.`,
      causalityLine: input.voiceoverBroll
        ? "Follow the approved storyboard action. Any featured person uses the saved avatar; background people may appear naturally."
        : "Only the presenter and established scene props move; no new object appears without contact.",
      endState: "product remains off camera",
    };
  }

  return {
    actionLine: `${buildProductBrollAction(product, input.role === "digital_demo")}.`,
    causalityLine: "The product never moves through human contact; only camera reframing or focus may change. Keep one identity, one form, and one stable surface.",
    endState: buildProductBrollPlacement(product, input.role === "digital_demo"),
  };
}

function describeSceneEnd(plan: OmniSegmentCreativePlan, productState: string) {
  const finalBeat = compactContinuityState(plan.beats[2]?.action || "the action settles");
  return `${finalBeat}; ${compactContinuityState(productState)}`;
}

function compactContinuityState(text: string, maxLength = 130) {
  return compactPromptPhrase(text, maxLength) || "stable established state";
}
