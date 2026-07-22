import type { OmniSegmentCreativePlan, ProductRole } from "@/lib/omni/creative-contract";

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
};

export function buildOmniGenerationContinuityDirection(
  input: BuildContinuityDirectionInput
): OmniGenerationContinuityDirection {
  const productAction = buildProductAction({
    productName: input.productName,
    role: input.plan.productRole,
    segmentIndex: input.segmentIndex,
    segmentCount: input.segmentCount,
    previousProductState: input.previousState?.productState || null,
    talkingHead: input.talkingHead,
  });
  const sceneStart = input.previousState
    ? `Start from previous final state: ${input.previousState.sceneState}; product state: ${input.previousState.productState}.`
    : `Start with the scene already established: ${describeInitialScene(input.plan)}.`;
  const nextState = {
    segmentIndex: input.segmentIndex,
    productState: productAction.endState,
    sceneState: describeSceneEnd(input.plan, productAction.endState),
    lastAction: input.plan.beats[2]?.action || productAction.actionLine,
  };

  return {
    promptLines: [
      `SCENE CONTINUITY: ${sceneStart}`,
      `PRODUCT ACTION: ${productAction.actionLine}`,
      `PHYSICAL CAUSALITY: ${productAction.causalityLine}`,
      `END STATE FOR NEXT PART: ${nextState.sceneState}; product state: ${nextState.productState}.`,
    ],
    nextState,
  };
}

function buildProductAction(input: {
  productName: string;
  role: ProductRole;
  segmentIndex: number;
  segmentCount: number;
  previousProductState: string | null;
  talkingHead: boolean;
}) {
  const product = input.productName || "the product";
  if (input.role === "hidden") {
    return {
      actionLine: `${product} stays outside the frame; do not introduce it as an image or overlay.`,
      causalityLine: "Only the presenter and established scene props move; no new object appears without contact.",
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

  return {
    actionLine: `${startState}; the presenter handles it as part of the routine, moving it from surface to hand and back without eating, drinking, or applying it while speaking.`,
    causalityLine: "Show the cause of each movement through hand contact and gravity; no teleporting, floating, duplication, or sudden material change.",
    endState: `${product} ends either in the presenter's hand or on the same surface, with a clear hand-driven path from its start position`,
  };
}

function describeInitialScene(plan: OmniSegmentCreativePlan) {
  const props = plan.continuityProps
    .map((item) => `${item.name} at ${item.initialPosition}`)
    .join(", ");
  return props || "same person, outfit, lighting, and room are visible before the first word";
}

function describeSceneEnd(plan: OmniSegmentCreativePlan, productState: string) {
  const finalBeat = plan.beats[2]?.action || "the action settles";
  return `${finalBeat}; ${productState}`;
}
