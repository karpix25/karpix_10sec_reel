import type { OmniSegmentCreativePlan, ProductRole } from "@/lib/omni/creative-contract";
import { compactPromptPhrase } from "./omni-scene-world-sanitizer";
import type { ReferenceFormatMode } from "./omni-reference-format-mode";
import type { DirectorWardrobeContinuity } from "./director-wardrobe";
import type { ReferenceTransferPolicy } from "./omni-reference-transfer-policy";
import type { ReferenceSegmentPlan } from "./reference-segment-plan";

type OmniGenerationReferenceState = {
  location: string;
  environment: string;
  lighting: string;
  camera: string;
  composition: string;
  subjectDistribution: string;
  wardrobe: string;
  sourceScene: string;
};

export type OmniGenerationContinuityState = {
  segmentIndex: number;
  productState: string;
  sceneState: string;
  lastAction: string;
  referenceState?: OmniGenerationReferenceState;
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
  const strictReference = input.referencePolicy?.mode === "full_reference";
  const voiceoverBrollReference = input.plan.referenceSceneMode === "voiceover_broll";
  const referenceState = strictReference
    ? buildReferenceState(input.referenceSegmentPlan, input.wardrobeContinuity)
    : undefined;
  const productAction = buildProductAction({
    productName: input.productName,
    role: input.plan.productRole,
    segmentIndex: input.segmentIndex,
    segmentCount: input.segmentCount,
    previousProductState: montageReference ? null : input.previousState?.productState || null,
    talkingHead: input.talkingHead,
    voiceoverBroll: voiceoverBrollReference,
  });
  const sceneStart = strictReference && referenceState
    ? input.previousState?.referenceState
      ? `Continue the previous verified source scene: ${renderReferenceState(input.previousState.referenceState)}. Apply only the current verified interval contract: ${renderReferenceState(referenceState)}.`
      : `Start in the verified source scene: ${renderReferenceState(referenceState)}.`
    : montageReference
    ? `Start this independent montage cut with its own approved reference setting and action: ${describeInitialScene(input.plan)}.`
    : input.previousState
    ? `Start from previous final state: ${compactContinuityState(input.previousState.sceneState)}; product state: ${compactContinuityState(input.previousState.productState)}.`
    : `Start with the scene already established: ${describeInitialScene(input.plan)}.`;
  const wardrobeInstruction = renderWardrobeContinuityInstruction(input.wardrobeContinuity);
  const nextState: OmniGenerationContinuityState = {
    segmentIndex: input.segmentIndex,
    productState: compactContinuityState(productAction.endState),
    sceneState: describeSceneEnd(input.plan, productAction.endState),
    lastAction: compactContinuityState(input.plan.beats[2]?.action || productAction.actionLine),
    ...(referenceState ? { referenceState } : {}),
  };

  const referenceContractLines = strictReference && referenceState
    ? renderReferenceContract(referenceState, input.referenceSegmentPlan)
    : [];

  return {
    promptLines: montageReference
      ? [
        `MONTAGE SEGMENT: ${sceneStart} Do not continue the previous segment's room, camera, or prop positions. ${wardrobeInstruction} ${voiceoverBrollReference ? "Any featured human uses the saved avatar identity; background people are allowed. Preserve only the approved product appearance." : "Keep the same featured presenter identity; preserve exact product appearance."}`,
        ...referenceContractLines,
        `PRODUCT ACTION: ${productAction.actionLine}`,
        `PHYSICAL CAUSALITY: ${productAction.causalityLine}`,
      ]
      : [
        `SCENE CONTINUITY: ${sceneStart}`,
        ...referenceContractLines,
        `PRODUCT ACTION: ${productAction.actionLine}`,
        `PHYSICAL CAUSALITY: ${productAction.causalityLine}`,
        `END STATE FOR NEXT PART: ${nextState.sceneState}; product state: ${nextState.productState}.`,
      ],
    nextState,
  };
}

function buildReferenceState(
  plan: ReferenceSegmentPlan | null | undefined,
  wardrobeContinuity?: DirectorWardrobeContinuity,
): OmniGenerationReferenceState | null {
  if (!plan?.beats.length) return null;
  const beats = plan.beats;
  const location = unique(beats.map((beat) => beat.setting)).join(" -> ") || "verified source location";
  const environment = unique(beats.map((beat) => beat.environment)).join(" -> ") || "verified source environment";
  const lighting = unique(beats.map((beat) => beat.lighting)).join(" -> ") || "verified source lighting";
  const camera = unique(beats.map((beat) => beat.camera)).join(" -> ") || "verified source camera";
  const composition = unique(beats.map((beat) => beat.composition || "")).join(" -> ") || "verified source composition";
  const subjectDistribution = beats.map((beat) => [
    `${beat.startSeconds}-${beat.endSeconds}s`,
    beat.sourceRole || "source_role_unknown",
    beat.visibleSubjectRole || "subject_role_unknown",
    beat.speechMode,
    `avatar_allowed=${beat.avatarAllowed === true ? "true" : beat.avatarAllowed === false ? "false" : "unknown"}`,
  ].join(" ")).join("; ");
  const wardrobe = renderStrictWardrobe(wardrobeContinuity);
  return {
    location: compactContinuityState(location),
    environment: compactContinuityState(environment),
    lighting: compactContinuityState(lighting),
    camera: compactContinuityState(camera),
    composition: compactContinuityState(composition),
    subjectDistribution: compactContinuityState(subjectDistribution, 220),
    wardrobe,
    sourceScene: compactContinuityState(unique(beats.map((beat) => `${beat.setting}; ${beat.environment}`)).join(" -> "), 220),
  };
}

function renderReferenceContract(
  state: OmniGenerationReferenceState,
  plan: ReferenceSegmentPlan | null | undefined,
) {
  return [
    "STRICT FULL_REFERENCE: the verified director timeline and this referenceSegmentPlan are the only sources of visual facts. content_adaptation changes meaning or product identity only; it never invents visual facts.",
    `REFERENCE SEGMENT CONTRACT: ${plan?.segmentIndex || "?"}/${plan?.segmentCount || "?"}; source ${plan?.sourceStartSeconds ?? "?"}-${plan?.sourceEndSeconds ?? "?"}s; ${renderReferenceState(state)}.`,
    `PRESENTER/B-ROLL DISTRIBUTION: ${state.subjectDistribution}. Do not turn a verified B-roll interval into a presenter shot or introduce a vehicle, room, or other scene absent from the contract.`,
    `WARDROBE CONTINUITY: ${state.wardrobe}`,
  ];
}

function renderReferenceState(state: OmniGenerationReferenceState) {
  return [
    `location=${state.location}`,
    `environment=${state.environment}`,
    `light=${state.lighting}`,
    `camera=${state.camera}`,
    `composition=${state.composition}`,
    `source_scene=${state.sourceScene}`,
  ].join("; ");
}

function renderStrictWardrobe(continuity?: DirectorWardrobeContinuity) {
  if (continuity === "not_visible") return "not visible in the verified source; do not invent clothing details";
  if (continuity === "changes_between_cuts") {
    return "follow the verified outfit for the current source interval; if it is incompatible with the avatar, use an avatar-compatible equivalent preserving color, material, and silhouette";
  }
  if (continuity === "stable") {
    return "keep the verified outfit across continuous segments; if it is incompatible with the avatar, use an avatar-compatible equivalent preserving color, material, and silhouette";
  }
  return "use only verified wardrobe details; if clothing is visible and incompatible with the avatar, use an avatar-compatible equivalent preserving color, material, and silhouette";
}

function unique(values: readonly string[]) {
  return [...new Set(values.map((value) => value.replace(/\s+/gu, " ").trim()).filter(Boolean))];
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

function describeInitialScene(plan: OmniSegmentCreativePlan) {
  const props = plan.continuityProps
    .slice(0, 3)
    .map((item) => `${compactContinuityState(item.name, 48)} at ${compactContinuityState(item.initialPosition, 72)}`)
    .join(", ");
  return props || "same person, outfit, lighting, and room are visible before the first word";
}

function describeSceneEnd(plan: OmniSegmentCreativePlan, productState: string) {
  const finalBeat = compactContinuityState(plan.beats[2]?.action || "the action settles");
  return `${finalBeat}; ${compactContinuityState(productState)}`;
}

function compactContinuityState(text: string, maxLength = 130) {
  return compactPromptPhrase(text, maxLength) || "stable established state";
}
