import type { OmniSegmentCreativePlan, ProductRole } from "@/lib/omni/creative-contract";
import { compactPromptPhrase } from "./omni-scene-world-sanitizer";
import type { ReferenceFormatMode } from "./omni-reference-format-mode";
import type { DirectorWardrobeContinuity } from "./director-wardrobe";
import type { ReferenceTransferPolicy } from "./omni-reference-transfer-policy";
import type { ReferenceSegmentPlan } from "./reference-segment-plan";

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
  const productAction = buildProductAction({
    productName: input.productName,
    role: input.plan.productRole,
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
  const productContinuity = input.plan.productRole === "hidden"
    ? "Product stays off camera."
    : "Preserve the same product identity and physical state across the segment boundary; follow the current storyboard's visible action.";
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
  segmentIndex: number;
  segmentCount: number;
  previousProductState: string | null;
  talkingHead: boolean;
  voiceoverBroll: boolean;
}) {
  const product = input.productName || "the product";
  if (input.role === "hidden") {
    return {
      actionLine: `${product} stays outside the frame; do not introduce it as an image or overlay.`,
      causalityLine: input.voiceoverBroll
        ? "Follow the approved storyboard action. Any featured person uses the saved avatar; background people may appear naturally."
        : "Only the presenter and established scene props move; no new object appears without contact.",
      endState: "product remains off camera",
    };
  }

  const startState = input.previousProductState && input.previousProductState !== "product remains off camera"
    ? input.previousProductState
    : `${product} starts as a real prop resting on a stable surface within reach`;

  if (input.role === "background_prop") {
    const action = input.talkingHead
      ? `${startState}; in the cutaway, a hand naturally slides or rotates it once, then leaves it resting on the same surface`
      : `${startState}; the presenter lightly adjusts or passes near it during the spoken action, then leaves it stable`;
    return {
      actionLine: `${action}.`,
      causalityLine: "The product moves only because a visible hand touches it or the camera reframes; it is never a pasted still image.",
      endState: `${product} rests on the same stable surface, slightly adjusted and still physically present`,
    };
  }

  if (input.role === "brief_demo") {
    return {
      actionLine: `${startState}; the presenter picks it up, turns the real package toward camera once, then places it back without a hard advertising close-up.`,
      causalityLine: "Every movement follows hand contact: lift, small rotation, placement. Keep size, label layout, material, and shadows consistent.",
      endState: `${product} rests back on the surface near the presenter, label orientation preserved`,
    };
  }

  if (input.role === "digital_demo") {
    return {
      actionLine: `${product} appears only as the approved product screen on a smartphone when the matching B-roll cut calls for it; never turn it into a plastic card or package.`,
      causalityLine: "The smartphone enters or leaves through visible hand or camera movement; the approved screen remains unchanged.",
      endState: `${product} remains off camera or on the approved smartphone screen`,
    };
  }

  return {
    actionLine: `${startState}; the presenter handles it as part of the routine, moving it from surface to hand and back without eating, drinking, or applying it while speaking.`,
    causalityLine: "Show the cause of each movement through hand contact and gravity; no teleporting, floating, duplication, or sudden material change.",
    endState: `${product} ends either in the presenter's hand or on the same surface, with a clear hand-driven path from its start position`,
  };
}

function describeSceneEnd(plan: OmniSegmentCreativePlan, productState: string) {
  const finalBeat = compactContinuityState(plan.beats[2]?.action || "the action settles");
  return `${finalBeat}; ${compactContinuityState(productState)}`;
}

function compactContinuityState(text: string, maxLength = 130) {
  return compactPromptPhrase(text, maxLength) || "stable established state";
}
