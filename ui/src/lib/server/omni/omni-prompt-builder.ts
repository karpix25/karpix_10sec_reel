import type { OmniClientAvatar, OmniGeneratedScript, OmniProduct, OmniReferenceAsset } from "@/lib/omni/types";
import type { OmniStoryboardSegment, OmniStoryboardValidationResult } from "@/lib/omni/storyboard/omni-storyboard-types";
import type { OmniWardrobeSource } from "../../omni/wardrobe-source";
import type {
  CtaMode,
  LifeFormatId,
  OmniCreativeStrategy,
  OmniPromptValidationResult,
  OmniSegmentCreativePlan,
  ProductRole,
} from "@/lib/omni/creative-contract";
import { extractDirectorBriefFromSnapshot, type DirectorBrief } from "./director-analysis-types";
import { selectOmniCreativeStrategy } from "./omni-format-selector";
import { splitScriptIntoVoiceSegments, type VoiceSegment } from "./omni-script-segmentation";
import {
  extractGeneratedScriptBeatPlanFromSnapshot,
  selectScriptBeatsForSegment,
} from "./script-beat-plan";
import {
  extractProviderPromptPlanFromSnapshot,
} from "./llm-prompt-chain-normalizer";
import { assertOmniScriptTextContract, sanitizeOmniScriptText } from "./omni-script-text-contract";
import {
  validatePromptVoiceoverIsolation,
  validateVoiceoverSequence,
} from "./omni-prompt-validator";
import { getOmniSegmentWordBudget } from "./omni-duration-planner";
import { assertOmniCtaContract } from "./omni-cta-contract";
import {
  buildOmniGenerationContinuityDirection,
  type OmniGenerationContinuityState,
} from "./omni-generation-continuity";
import { repairScriptBeatBoundaryRepeats, repairVoiceSegmentBoundaryRepeats } from "./omni-speech-boundary";
import { buildOmniCharacterContract } from "./omni-character-contract";
import { isTalkingHeadCutawayFormat } from "./omni-talking-head-format";
import { buildSegmentCreativePlan } from "./omni-segment-creative-plan";
import {
  buildStoryboardFromPromptChainFrames,
  buildStoryboardFromCreativePlan,
} from "./storyboard/omni-storyboard-builder";
import { renderCompactRussianOmniStoryboardPrompt } from "./storyboard/omni-storyboard-renderer";
import { buildReferenceTransferPolicy } from "./omni-reference-transfer-policy";
import { applyDirectorLayoutToPlan, buildDirectorLayoutContract } from "./director-layout-contract";
import {
  buildProductVisualProfileFromText,
  extractProductVisualProfileFromSnapshot,
  normalizeProductVisualProfile,
  renderProductVisualProfileForPrompt,
} from "./product-visual-profile";
import {
  renderProductPhysicalHintForStoryboard,
  resolveProductPhysicalContract,
} from "./product-physical-contract";
import {
  mentionsOmniProduct,
} from "./omni-intro-product-contract";

export type OmniSegmentPrompt = {
  index: number;
  role: string;
  prompt: string;
  referenceUrl: string | null;
  durationSeconds: number;
  voiceoverText: string;
  storyboardPlan: OmniStoryboardSegment | null;
  storyboardValidation: OmniStoryboardValidationResult | null;
  creativeStrategy: OmniCreativeStrategy;
  creativePlan: OmniSegmentCreativePlan;
  validation: OmniPromptValidationResult;
};

type BuildOmniPromptsInput = {
  generatedScript: OmniGeneratedScript | null;
  legacyTranscript: string | null;
  product: OmniProduct;
  avatar: OmniClientAvatar | null;
  segmentCount: number;
  segmentSeconds: number;
  voiceSegments?: readonly VoiceSegment[];
  segmentDurationsSeconds?: readonly number[];
  brief: string | null;
  directorBrief?: DirectorBrief | null;
  targetAudience?: string | null;
  wardrobeSource?: OmniWardrobeSource;
  ctaMode?: CtaMode;
  ctaValue?: string | null;
  recentFormatIds?: readonly LifeFormatId[];
};

export function buildOmniSegmentPrompts(input: BuildOmniPromptsInput): OmniSegmentPrompt[] {
  let scriptText = sanitizeOmniScriptText(input.generatedScript?.script || input.legacyTranscript || input.brief || "");
  assertOmniScriptTextContract(scriptText);
  const providerPromptPlan = extractProviderPromptPlanFromSnapshot(input.generatedScript?.source_snapshot);
  if (providerPromptPlan) {
    return buildStoredProviderPromptSegments(
      input,
      providerPromptPlan,
      scriptText
    );
  }

  const rawVoiceSegments = input.voiceSegments?.length
    ? [...input.voiceSegments]
    : splitScriptIntoVoiceSegments(
        scriptText,
        input.segmentCount,
        getOmniSegmentWordBudget(input.segmentSeconds)
      );
  const boundaryRepair = repairVoiceSegmentBoundaryRepeats(rawVoiceSegments);
  const voiceSegments = boundaryRepair.segments;
  if (boundaryRepair.repair.changed) {
    scriptText = sanitizeOmniScriptText(boundaryRepair.scriptText);
    assertOmniScriptTextContract(scriptText);
  }
  if (voiceSegments.length !== input.segmentCount) {
    throw new Error(`Script is too short for ${input.segmentCount} exact-speech Omni segments`);
  }
  const segmentDurationsSeconds = voiceSegments.map((_, index) =>
    input.segmentDurationsSeconds?.[index] || input.segmentSeconds
  );
  const scriptPlanRepair = repairScriptBeatBoundaryRepeats(
    extractGeneratedScriptBeatPlanFromSnapshot(input.generatedScript?.source_snapshot)
  );
  const scriptPlan = scriptPlanRepair.plan;

  const productReference = getPrimaryReference(input.product.product_refs);
  const productVisualProfile = resolveProductVisualProfile({
    product: input.product,
    generatedScript: input.generatedScript,
  });
  const productVisualPassport = renderProductVisualProfileForPrompt(productVisualProfile);
  const productPhysicalContract = resolveProductPhysicalContract({
    product: input.product,
    generatedScript: input.generatedScript,
  });
  const productPhysicalHint = renderProductPhysicalHintForStoryboard(productPhysicalContract);
  const avatarReference = input.avatar?.reference_url || null;
  const characterContract = buildOmniCharacterContract({
    product: input.product,
    avatar: input.avatar,
  });
  const directorBrief =
    input.directorBrief || extractDirectorBriefFromSnapshot(input.generatedScript?.source_snapshot);
  const referencePolicy = buildReferenceTransferPolicy({
    directorBrief,
    productName: input.product.name,
    productDescription: input.product.description,
    productReferenceNotes: input.product.product_reference_notes,
    hasProductReference: Boolean(productReference),
  });
  const layoutContract = buildDirectorLayoutContract(directorBrief, referencePolicy);
  const strategy = selectOmniCreativeStrategy({
    script: scriptText,
    firstSpokenLine: voiceSegments[0]?.text,
    productName: input.product.name,
    productDescription: input.product.description,
    targetAudience: input.targetAudience,
    hasProductReference: Boolean(productReference),
    ctaMode: input.ctaMode,
    ctaValue: input.ctaValue,
    recentFormatIds: input.recentFormatIds,
  });
  assertOmniCtaContract(scriptText, strategy);
  const prompts: OmniSegmentPrompt[] = [];
  let previousContinuityState: OmniGenerationContinuityState | null = null;
  let productIntroduced = false;

  for (let index = 0; index < voiceSegments.length; index += 1) {
    const segmentIndex = index + 1;
    const segmentSeconds = segmentDurationsSeconds[index] || input.segmentSeconds;
    const segmentRole = getSegmentRole(segmentIndex, input.segmentCount);
    const segmentScriptBeats = selectScriptBeatsForSegment(scriptPlan, segmentIndex, input.segmentCount);
    const baseProductRole = getSegmentProductRole(
      strategy.productRole,
      voiceSegments[index].text,
      input.product.name,
      productIntroduced
    );
    const productRole = baseProductRole;
    const segmentProductVisualPassport = productVisualPassport;
    const plan = applyDirectorLayoutToPlan(buildSegmentCreativePlan({
      segmentIndex,
      voiceoverText: voiceSegments[index].text,
      strategy,
      productRole,
      segmentCount: input.segmentCount,
      segmentSeconds,
      scriptBeats: segmentScriptBeats,
    }), layoutContract);
    const talkingHead = isTalkingHeadCutawayFormat(strategy.lifeFormatId);
    const continuityDirection = buildOmniGenerationContinuityDirection({
      plan,
      productName: input.product.name,
      segmentIndex,
      segmentCount: input.segmentCount,
      previousState: previousContinuityState,
      talkingHead,
    });
    const storyboardPlan = buildStoryboardFromCreativePlan({
      plan,
      productName: input.product.name,
      productVisualPassport: segmentProductVisualPassport,
      productPhysicalHint,
      characterContract,
      segmentIndex,
      segmentCount: input.segmentCount,
      durationSeconds: segmentSeconds,
      directorBrief,
      wardrobeSource: input.wardrobeSource,
      productAlreadyVisible: productIntroduced,
    });
    const prompt = renderCompactRussianOmniStoryboardPrompt({
      storyboard: storyboardPlan,
      productName: input.product.name,
      productPhysicalContract: plan.productRole !== "hidden" ? productPhysicalContract : null,
      segmentCount: input.segmentCount,
      directorBrief,
    });
    const validation = { valid: true, score: 100, errors: [], warnings: [] };
    prompts.push({
      index: segmentIndex,
      role: segmentRole,
      prompt,
      referenceUrl: selectReferenceUrl(productRole, avatarReference, productReference),
      durationSeconds: segmentSeconds,
      voiceoverText: plan.voiceoverText,
      storyboardPlan,
      storyboardValidation: null,
      creativeStrategy: strategy,
      creativePlan: plan,
      validation,
    });
    productIntroduced = productIntroduced || storyboardPlan.frames.some((frame) =>
      mentionsOmniProduct(frame.spokenText, input.product.name)
    );
    previousContinuityState = continuityDirection.nextState;
  }

  const voiceoverIsolationErrors = validatePromptVoiceoverIsolation(prompts);
  if (voiceoverIsolationErrors.length) {
    throw new Error(`Omni segment prompts leak neighbor speech: ${voiceoverIsolationErrors.join(", ")}`);
  }
  if (!validateVoiceoverSequence(scriptText, prompts.map((item) => item.creativePlan))) {
    throw new Error("Omni voiceover segmentation changed the source script");
  }
  return prompts;
}

function getSegmentProductRole(
  role: ProductRole,
  voiceoverText: string,
  productName = "",
  productIntroduced = false
): ProductRole {
  if (role === "hidden") return role;
  if (productIntroduced || mentionsOmniProduct(voiceoverText, productName)) {
    return "brief_demo";
  }
  return "hidden";
}

function buildStoredProviderPromptSegments(
  input: BuildOmniPromptsInput,
  providerPromptPlan: NonNullable<ReturnType<typeof extractProviderPromptPlanFromSnapshot>>,
  scriptText: string
): OmniSegmentPrompt[] {
  const providerVoiceover = providerPromptPlan.segmentPrompts.map((segment) => segment.voiceover).join(" ");
  if (sanitizeOmniScriptText(providerVoiceover) !== scriptText) {
    throw new Error("LLM provider prompt plan voiceover does not match generated script");
  }

  const productReference = getPrimaryReference(input.product.product_refs);
  const avatarReference = input.avatar?.reference_url || null;
  const productPhysicalContract = resolveProductPhysicalContract({
    product: input.product,
    generatedScript: input.generatedScript,
  });
  const productPhysicalHint = renderProductPhysicalHintForStoryboard(productPhysicalContract);
  const strategy = selectOmniCreativeStrategy({
    script: scriptText,
    firstSpokenLine: providerPromptPlan.segmentPrompts[0]?.voiceover,
    productName: input.product.name,
    productDescription: input.product.description,
    targetAudience: input.targetAudience,
    hasProductReference: Boolean(productReference),
    ctaMode: input.ctaMode,
    ctaValue: input.ctaValue,
    recentFormatIds: input.recentFormatIds,
  });
  assertOmniCtaContract(scriptText, strategy);

  let productIntroduced = false;
  return providerPromptPlan.segmentPrompts.map((segment, index) => {
    const segmentIndex = index + 1;
    const segmentMentionsProduct = segment.storyboardFrames.some((frame) =>
      mentionsOmniProduct(frame.spokenWords, input.product.name)
    );
    const productRole: ProductRole = productIntroduced || segmentMentionsProduct ? "brief_demo" : "hidden";
    const creativePlan = buildStoredCreativePlan({
      segmentIndex,
      segmentCount: providerPromptPlan.segmentPrompts.length,
      voiceoverText: segment.voiceover,
      productRole,
      segmentSeconds: segment.durationSeconds,
      strategy,
    });
    const storyboardPlan = buildStoryboardFromPromptChainFrames({
      segmentIndex,
      durationSeconds: segment.durationSeconds,
      voiceoverText: segment.voiceover,
      frames: segment.storyboardFrames,
      productName: input.product.name,
      productPhysicalHint,
      productAlreadyVisible: productIntroduced,
    });
    const validation = { valid: true, score: 100, errors: [], warnings: [] };
    productIntroduced = productIntroduced || segmentMentionsProduct;
    const prompt = renderCompactRussianOmniStoryboardPrompt({
      storyboard: storyboardPlan,
      productName: input.product.name,
      productPhysicalContract: productRole !== "hidden" ? productPhysicalContract : null,
      segmentCount: providerPromptPlan.segmentPrompts.length,
      directorBrief: input.directorBrief,
    });
    return {
      index: segmentIndex,
      role: getSegmentRole(segmentIndex, providerPromptPlan.segmentPrompts.length),
      prompt,
      referenceUrl: selectStoredReferenceUrl(segment.referenceRole, avatarReference, productReference),
      durationSeconds: segment.durationSeconds,
      voiceoverText: segment.voiceover,
      storyboardPlan,
      storyboardValidation: null,
      creativeStrategy: strategy,
      creativePlan,
      validation,
    };
  });
}

function buildStoredCreativePlan(input: {
  segmentIndex: number;
  segmentCount: number;
  voiceoverText: string;
  productRole: ProductRole;
  segmentSeconds: number;
  strategy: OmniCreativeStrategy;
}): OmniSegmentCreativePlan {
  const middleStart = roundOne(Math.max(1, input.segmentSeconds * 0.55));
  const middleEnd = roundOne(Math.min(input.segmentSeconds - 1, input.segmentSeconds * 0.75));
  return {
    segmentIndex: input.segmentIndex,
    lifeFormatId: input.strategy.lifeFormatId,
    speechStartsAtSeconds: 0,
    voiceoverText: input.voiceoverText,
    productRole: input.productRole,
    continuityProps: input.strategy.continuityProps,
    beats: [
      { startSeconds: 0, endSeconds: middleStart, action: "LLM provider prompt face opening" },
      { startSeconds: middleStart, endSeconds: middleEnd, action: "LLM provider prompt middle cutaway" },
      { startSeconds: middleEnd, endSeconds: input.segmentSeconds, action: "LLM provider prompt face return" },
    ],
  };
}

function selectStoredReferenceUrl(
  referenceRole: "avatar" | "product" | "none",
  avatarReference: string | null,
  productReference: OmniReferenceAsset | null
) {
  if (referenceRole === "product") return productReference?.url || avatarReference;
  if (referenceRole === "none") return null;
  return avatarReference;
}

function selectReferenceUrl(
  role: ProductRole,
  avatarReference: string | null,
  productReference: OmniReferenceAsset | null
) {
  if (role === "hidden") return avatarReference;
  return productReference?.url || avatarReference;
}

function getPrimaryReference(refs: OmniReferenceAsset[]) {
  return refs.find((ref) => ref.is_primary && ref.kind === "image") || refs.find((ref) => ref.kind === "image") || null;
}

function resolveProductVisualProfile(input: {
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

function getSegmentRole(index: number, total: number) {
  if (index === 1) return "hook";
  if (index === total) return "cta_or_payoff";
  return "body";
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}
