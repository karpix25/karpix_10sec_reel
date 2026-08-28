import type { OmniClientAvatar, OmniGeneratedScript, OmniProduct } from "@/lib/omni/types";
import type { OmniStoryboardSegment, OmniStoryboardValidationResult } from "@/lib/omni/storyboard/omni-storyboard-types";
import type { OmniWardrobeSource } from "../../omni/wardrobe-source";
import type {
  CtaMode,
  LifeFormatId,
  OmniCreativeStrategy,
  OmniPromptValidationResult,
  OmniSegmentCreativePlan,
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
import {
  applyReferenceSceneModeToOmniPrompt,
  resolveReferenceSceneMode,
} from "./omni-reference-scene-mode";
import { resolveDirectorVisibleSubjectPolicy } from "./director-visibility-policy";
import { resolveReferenceFormatMode } from "./omni-reference-format-mode";
import { applyDirectorLayoutToPlan, buildDirectorLayoutContract } from "./director-layout-contract";
import {
  renderProductVisualProfileForPrompt,
} from "./product-visual-profile";
import {
  renderProductPhysicalHintForStoryboard,
  resolveProductPhysicalContract,
} from "./product-physical-contract";
import { deriveOmniSegmentIntents } from "./omni-segment-intent";
import { buildOmniProductVisualIntent } from "./omni-product-visual-intent";
import { alignStoryboardFramesToVoiceover } from "./storyboard/omni-storyboard-speech";
import {
  repairPhysicalScenePrompt,
  validatePhysicalScene,
} from "./physical-scene-validator";
import { validateStoryboardFrameSourceInterval } from "./llm-prompt-chain-storyboard-validator";
import {
  buildStoredCreativePlan,
  getPrimaryReference,
  getSegmentRole,
  resolvePhysicalProductDemoRole,
  resolveProductVisualProfile,
  selectReferenceUrl,
  selectPhysicalProductDemoSegmentIndex,
} from "./omni-prompt-segment-support";
import {
  applyReferenceSegmentPlanToFrames, applyReferenceSegmentPlanToStoryboard, buildReferenceSegmentPlan,
  type ReferenceSegmentPlan,
} from "./reference-segment-plan";
import {
  assertOmniTimedVoiceoverPlanMatchesScript,
  type OmniTimedVoiceoverPlan,
} from "./omni-timed-voiceover-plan";
import { assertProviderPlanUsesTimedVoiceover } from "./omni-timed-voiceover-provider-contract";

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
  referenceSegmentPlan: ReferenceSegmentPlan | null;
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
  timedVoiceoverPlan?: OmniTimedVoiceoverPlan;
  brief: string | null;
  directorBrief?: DirectorBrief | null;
  targetAudience?: string | null;
  wardrobeSource?: OmniWardrobeSource;
  ctaMode?: CtaMode;
  ctaValue?: string | null;
  recentFormatIds?: readonly LifeFormatId[];
  referenceSourceDurationSeconds?: number | null;
};

export function buildOmniSegmentPrompts(input: BuildOmniPromptsInput): OmniSegmentPrompt[] {
  let scriptText = sanitizeOmniScriptText(input.generatedScript?.script || input.legacyTranscript || input.brief || "");
  assertOmniScriptTextContract(scriptText);
  if (input.timedVoiceoverPlan) {
    assertOmniTimedVoiceoverPlanMatchesScript(input.timedVoiceoverPlan, scriptText);
    if (input.timedVoiceoverPlan.segmentCount !== input.segmentCount) {
      throw new Error("Timed voiceover plan segment count does not match prompt input");
    }
  }
  const providerPromptPlan = extractProviderPromptPlanFromSnapshot(input.generatedScript?.source_snapshot);
  if (providerPromptPlan) {
    if (input.timedVoiceoverPlan) assertProviderPlanUsesTimedVoiceover(providerPromptPlan, input.timedVoiceoverPlan);
    return buildStoredProviderPromptSegments(
      input,
      providerPromptPlan,
      scriptText
    );
  }

  const rawVoiceSegments = input.timedVoiceoverPlan?.segments?.length
    ? [...input.timedVoiceoverPlan.segments]
    : input.voiceSegments?.length
    ? [...input.voiceSegments]
    : splitScriptIntoVoiceSegments(
        scriptText,
        input.segmentCount,
        getOmniSegmentWordBudget(input.segmentSeconds)
      );
  let voiceSegments = rawVoiceSegments;
  if (!input.timedVoiceoverPlan) {
    const boundaryRepair = repairVoiceSegmentBoundaryRepeats(rawVoiceSegments);
    voiceSegments = boundaryRepair.segments;
    if (boundaryRepair.repair.changed) {
      scriptText = sanitizeOmniScriptText(boundaryRepair.scriptText);
      assertOmniScriptTextContract(scriptText);
    }
  }
  if (voiceSegments.length !== input.segmentCount) {
    throw new Error(`Script is too short for ${input.segmentCount} exact-speech Omni segments`);
  }
  const segmentDurationsSeconds = input.timedVoiceoverPlan
    ? input.timedVoiceoverPlan.segments.map((segment) => segment.durationSeconds)
    : voiceSegments.map((_, index) => input.segmentDurationsSeconds?.[index] || input.segmentSeconds);
  const segmentIntents = deriveOmniSegmentIntents(voiceSegments, input.product.name);
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
  const directorBrief =
    input.directorBrief || extractDirectorBriefFromSnapshot(input.generatedScript?.source_snapshot);
  const referenceSceneMode = resolveReferenceSceneMode(directorBrief);
  const referenceFormatMode = resolveReferenceFormatMode(directorBrief);
  const characterContract = buildOmniCharacterContract({
    product: input.product,
    avatar: input.avatar,
    referenceSceneMode,
    referenceFormatMode,
    wardrobeSource: input.wardrobeSource,
    wardrobeContinuity: directorBrief?.wardrobe_continuity,
  });
  const referencePolicy = buildReferenceTransferPolicy({
    hasProductReference: Boolean(productReference),
    directorBrief,
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
    referenceSceneMode,
  });
  const productDemoSegmentIndex = selectPhysicalProductDemoSegmentIndex({
    segments: segmentIntents,
    productName: input.product.name,
    productRole: strategy.productRole,
  });
  assertOmniCtaContract(scriptText, strategy);
  const prompts: OmniSegmentPrompt[] = [];
  let previousContinuityState: OmniGenerationContinuityState | null = null;
  let outputStartSeconds = 0;
  const outputTotalDurationSeconds = segmentDurationsSeconds.reduce((sum, value) => sum + value, 0);
  for (let index = 0; index < voiceSegments.length; index += 1) {
    const segmentIntent = segmentIntents[index];
    const segmentIndex = index + 1;
    const segmentSeconds = segmentDurationsSeconds[index] || input.segmentSeconds;
    const segmentRole = getSegmentRole(segmentIndex, input.segmentCount);
    const segmentScriptBeats = selectScriptBeatsForSegment(scriptPlan, segmentIndex, input.segmentCount);
    const referenceSegmentPlan = buildReferenceSegmentPlan({
      brief: directorBrief,
      segmentIndex,
      segmentCount: input.segmentCount,
      segmentSeconds,
      voiceoverText: referencePolicy.mode === "full_reference" ? segmentIntent.spokenText : undefined,
      outputStartSeconds,
      outputTotalDurationSeconds,
      sourceDurationSeconds: input.referenceSourceDurationSeconds,
    });
    const productRole = resolvePhysicalProductDemoRole(segmentIndex, productDemoSegmentIndex, strategy.productRole, Boolean(segmentIntent.productMentioned));
    const plan = applyDirectorLayoutToPlan(buildSegmentCreativePlan({
      segmentIndex,
      voiceoverText: segmentIntent.spokenText,
      strategy,
      productRole,
      segmentCount: input.segmentCount,
      segmentSeconds,
      scriptBeats: segmentScriptBeats,
    }), layoutContract);
    plan.productVisibleByFrame = buildOmniProductVisualIntent({ voiceoverText: segmentIntent.spokenText, durationSeconds: segmentSeconds, productName: input.product.name, productRole, referenceSegmentPlan }).visibleByFrame;
    const talkingHead = isTalkingHeadCutawayFormat(strategy.lifeFormatId) && referenceSceneMode === "presenter";
    const continuityDirection = buildOmniGenerationContinuityDirection({
      plan,
      productName: input.product.name,
      segmentIndex,
      segmentCount: input.segmentCount,
      previousState: previousContinuityState,
      talkingHead,
      referenceFormatMode,
      wardrobeContinuity: directorBrief?.wardrobe_continuity,
      referencePolicy,
      referenceSegmentPlan,
    });
    const storyboardPlan = applyReferenceSegmentPlanToStoryboard(referenceSegmentPlan, buildStoryboardFromCreativePlan({
      plan,
      productName: input.product.name,
      productVisualPassport,
      productPhysicalHint: productRole === "digital_demo" ? null : productPhysicalHint,
      characterContract,
      segmentIndex,
      segmentCount: input.segmentCount,
      durationSeconds: segmentSeconds,
      directorBrief,
      wardrobeSource: input.wardrobeSource,
      referenceTransferPolicy: referencePolicy,
      referenceSceneMode,
    }), referencePolicy.mode === "full_reference");
    const validation = validatePhysicalScene({
      storyboard: storyboardPlan,
      creativePlan: plan,
      productName: input.product.name,
    });
    const prompt = applyReferenceSceneModeToOmniPrompt(repairPhysicalScenePrompt(renderCompactRussianOmniStoryboardPrompt({
      storyboard: storyboardPlan,
      productName: input.product.name,
      productPhysicalContract: plan.productRole !== "hidden" && plan.productRole !== "digital_demo" ? productPhysicalContract : null,
      productRole: plan.productRole,
      segmentCount: input.segmentCount,
      directorBrief,
      referenceSceneMode,
    }), validation), referenceSceneMode, resolveDirectorVisibleSubjectPolicy(directorBrief));
    const promptWithReferencePlan = [prompt, ...continuityDirection.promptLines]
      .filter(Boolean).join("\n\n");
    prompts.push({
      index: segmentIndex,
      role: segmentRole,
      prompt: promptWithReferencePlan,
      referenceUrl: selectReferenceUrl(productRole, avatarReference, productReference, referenceSceneMode),
      durationSeconds: segmentSeconds,
      voiceoverText: plan.voiceoverText,
      storyboardPlan,
      storyboardValidation: null,
      creativeStrategy: strategy,
      creativePlan: plan,
      referenceSegmentPlan,
      validation,
    });
    previousContinuityState = referenceFormatMode === "voiceover_montage"
      ? null
      : continuityDirection.nextState;
    outputStartSeconds += segmentSeconds;
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
  const directorBrief = input.directorBrief || extractDirectorBriefFromSnapshot(input.generatedScript?.source_snapshot);
  const referenceSceneMode = resolveReferenceSceneMode(directorBrief);
  const referencePolicy = buildReferenceTransferPolicy({
    hasProductReference: Boolean(productReference),
    directorBrief,
  });
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
    referenceSceneMode,
  });
  assertOmniCtaContract(scriptText, strategy);
  const segmentIntents = deriveOmniSegmentIntents(
    providerPromptPlan.segmentPrompts.map((segment) => ({ index: segment.index, spokenText: segment.voiceover })),
    input.product.name
  );
  const productDemoSegmentIndex = selectPhysicalProductDemoSegmentIndex({
    segments: segmentIntents,
    productName: input.product.name,
    productRole: strategy.productRole,
  });

  let outputStartSeconds = 0;
  const outputTotalDurationSeconds = providerPromptPlan.segmentPrompts.reduce(
    (sum, segment) => sum + segment.durationSeconds,
    0
  );
  const referenceFormatMode = resolveReferenceFormatMode(directorBrief);
  let previousContinuityState: OmniGenerationContinuityState | null = null;
  return providerPromptPlan.segmentPrompts.map((segment, index) => {
    const segmentIndex = index + 1;
    const segmentIntent = segmentIntents[index];
    const productRole = resolvePhysicalProductDemoRole(segmentIndex, productDemoSegmentIndex, strategy.productRole, Boolean(segmentIntent?.productMentioned));
    const voiceoverText = segmentIntent?.spokenText || segment.voiceover;
    const referenceSegmentPlan = buildReferenceSegmentPlan({
      brief: directorBrief,
      segmentIndex,
      segmentCount: providerPromptPlan.segmentPrompts.length,
      segmentSeconds: segment.durationSeconds,
      voiceoverText: referencePolicy.mode === "full_reference" ? voiceoverText : undefined,
      outputStartSeconds,
      outputTotalDurationSeconds,
      sourceDurationSeconds: input.referenceSourceDurationSeconds,
    });
    const productVisibleByFrame = buildOmniProductVisualIntent({ voiceoverText, durationSeconds: segment.durationSeconds, productName: input.product.name, productRole, referenceSegmentPlan }).visibleByFrame;
    const creativePlan = buildStoredCreativePlan({
      segmentIndex,
      segmentCount: providerPromptPlan.segmentPrompts.length,
      voiceoverText,
      productRole,
      segmentSeconds: segment.durationSeconds,
      productVisibleByFrame,
      strategy,
    });
    const alignedFrames = alignStoryboardFramesToVoiceover({
      frames: segment.storyboardFrames,
      voiceoverText,
      durationSeconds: segment.durationSeconds,
    });
    const sourceFrames = referencePolicy.mode === "full_reference"
      ? applyReferenceSegmentPlanToFrames(referenceSegmentPlan, alignedFrames, true, { productVisibleByFrame })
      : alignedFrames;
    const sourceIssues = referencePolicy.mode === "full_reference" && referenceSegmentPlan
      ? sourceFrames.flatMap((frame, frameIndex) => validateStoryboardFrameSourceInterval({
        frame,
        frameIndex,
        frameCount: sourceFrames.length,
        path: `provider.segmentPrompts.${index}.storyboardFrames.${frameIndex}`,
        plan: referenceSegmentPlan,
        productName: input.product.name,
        productVisible: productVisibleByFrame[frameIndex],
      }))
      : [];
    const sourceErrors = sourceIssues.filter((issue) => issue.severity === "error");
    if (sourceErrors.length) {
      throw new Error(`Stored provider plan violates the verified reference contract: ${sourceErrors.map((issue) => issue.code).join(", ")}`);
    }
    const talkingHead = isTalkingHeadCutawayFormat(strategy.lifeFormatId) && referenceSceneMode === "presenter";
    const continuityDirection = buildOmniGenerationContinuityDirection({
      plan: creativePlan,
      productName: input.product.name,
      segmentIndex,
      segmentCount: providerPromptPlan.segmentPrompts.length,
      previousState: previousContinuityState,
      talkingHead,
      referenceFormatMode,
      wardrobeContinuity: directorBrief?.wardrobe_continuity,
      referencePolicy,
      referenceSegmentPlan,
    });
    const storyboardPlan = applyReferenceSegmentPlanToStoryboard(referenceSegmentPlan, buildStoryboardFromPromptChainFrames({
      segmentIndex,
      durationSeconds: segment.durationSeconds,
      voiceoverText,
      frames: sourceFrames,
      productName: input.product.name,
      productPhysicalHint: productRole === "digital_demo" ? null : productPhysicalHint,
      directorBrief,
      segmentCount: providerPromptPlan.segmentPrompts.length,
      productVisible: productVisibleByFrame,
      productRole,
      referenceTransferPolicy: referencePolicy,
      referenceSceneMode,
    }), referencePolicy.mode === "full_reference");
    const validation = validatePhysicalScene({
      storyboard: storyboardPlan,
      creativePlan,
      productName: input.product.name,
    });
    const prompt = applyReferenceSceneModeToOmniPrompt(repairPhysicalScenePrompt(renderCompactRussianOmniStoryboardPrompt({
      storyboard: storyboardPlan,
      productName: input.product.name,
      productPhysicalContract: productRole !== "hidden" && productRole !== "digital_demo" ? productPhysicalContract : null,
      productRole,
      segmentCount: providerPromptPlan.segmentPrompts.length,
      directorBrief,
      referenceSceneMode,
    }), validation), referenceSceneMode, resolveDirectorVisibleSubjectPolicy(directorBrief));
    const promptWithReferencePlan = [prompt, ...continuityDirection.promptLines]
      .filter(Boolean).join("\n\n");
    outputStartSeconds += segment.durationSeconds;
    previousContinuityState = referenceFormatMode === "voiceover_montage"
      ? null
      : continuityDirection.nextState;
    return {
      index: segmentIndex,
      role: getSegmentRole(segmentIndex, providerPromptPlan.segmentPrompts.length),
      prompt: promptWithReferencePlan,
      referenceUrl: selectReferenceUrl(productRole, avatarReference, productReference, referenceSceneMode),
      durationSeconds: segment.durationSeconds,
      voiceoverText,
      storyboardPlan,
      storyboardValidation: null,
      creativeStrategy: strategy,
      creativePlan,
      referenceSegmentPlan,
      validation,
    };
  });
}
