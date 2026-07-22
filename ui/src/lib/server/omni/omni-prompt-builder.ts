import type { OmniClientAvatar, OmniGeneratedScript, OmniProduct, OmniReferenceAsset } from "@/lib/omni/types";
import { normalizeOmniWardrobeSource, type OmniWardrobeSource } from "../../omni/wardrobe-source";
import type {
  CtaMode,
  LifeFormatId,
  OmniCreativeStrategy,
  OmniScriptBeatCue,
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
import { assertOmniScriptTextContract, sanitizeOmniScriptText } from "./omni-script-text-contract";
import {
  validateOmniSegmentPrompt,
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
import { renderCompactSegmentPrompt } from "./omni-compact-segment-prompt";
import { buildReferenceTransferPolicy } from "./omni-reference-transfer-policy";
import { applyDirectorLayoutToPlan, buildDirectorLayoutContract } from "./director-layout-contract";
import {
  buildProductVisualProfileFromText,
  extractProductVisualProfileFromSnapshot,
  normalizeProductVisualProfile,
  renderProductPhysicalityContract,
  renderProductVisualProfileForPrompt,
} from "./product-visual-profile";

export type OmniSegmentPrompt = {
  index: number;
  role: string;
  prompt: string;
  referenceUrl: string | null;
  durationSeconds: number;
  voiceoverText: string;
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
  const productPhysicalityContract = renderProductPhysicalityContract(productVisualProfile);
  const avatarReference = input.avatar?.reference_url || null;
  const characterContract = buildOmniCharacterContract({
    product: input.product,
    avatar: input.avatar,
  });
  const wardrobeSource = normalizeOmniWardrobeSource(input.wardrobeSource);
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

  for (let index = 0; index < voiceSegments.length; index += 1) {
    const segmentIndex = index + 1;
    const segmentSeconds = segmentDurationsSeconds[index] || input.segmentSeconds;
    const segmentStartSeconds = sumDurationsBefore(segmentDurationsSeconds, index);
    const segmentEndSeconds = segmentStartSeconds + segmentSeconds;
    const segmentRole = getSegmentRole(segmentIndex, input.segmentCount);
    const segmentScriptBeats = selectScriptBeatsForSegment(scriptPlan, segmentIndex, input.segmentCount);
    const baseProductRole = getSegmentProductRole(
      strategy.productRole,
      segmentIndex,
      input.segmentCount,
      voiceSegments[index].text,
      segmentScriptBeats,
      input.product.name
    );
    const productRole = layoutContract?.requiresOpeningProductBackground && segmentIndex === 1 && baseProductRole === "hidden"
      ? "background_prop"
      : baseProductRole;
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
    const prompt = renderCompactSegmentPrompt({
      plan,
      strategy,
      characterContract,
      productName: input.product.name,
      productVisualPassport: segmentProductVisualPassport,
      productPhysicalityContract,
      segmentIndex,
      segmentCount: input.segmentCount,
      directorBrief,
      referencePolicy,
      wardrobeSource,
      continuityDirection,
      segmentStartSeconds,
      segmentEndSeconds,
    });
    const validation = validateOmniSegmentPrompt({
      prompt,
      plan,
      requiresProductVisualPassport: Boolean(segmentProductVisualPassport),
    });
    if (!validation.valid) {
      throw new Error(`Invalid Omni segment ${segmentIndex}: ${validation.errors.join(", ")}`);
    }
    prompts.push({
      index: segmentIndex,
      role: segmentRole,
      prompt,
      referenceUrl: selectReferenceUrl(productRole, avatarReference, productReference),
      durationSeconds: segmentSeconds,
      voiceoverText: plan.voiceoverText,
      creativeStrategy: strategy,
      creativePlan: plan,
      validation,
    });
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
  segmentIndex: number,
  segmentCount: number,
  voiceoverText: string,
  scriptBeats: readonly OmniScriptBeatCue[] = [],
  productName = ""
): ProductRole {
  if (role === "hidden") return role;
  if (
    segmentIndex > 1 &&
    segmentMentionsProduct({
      voiceoverText,
      scriptBeats,
      productName,
    })
  ) {
    return "background_prop";
  }
  if (role === "background_prop") return segmentIndex === 1 ? "hidden" : role;
  if (segmentIndex !== segmentCount) return "hidden";
  return countWords(voiceoverText) > 18 ? "background_prop" : role;
}

function segmentMentionsProduct(input: {
  voiceoverText: string;
  scriptBeats: readonly OmniScriptBeatCue[];
  productName: string;
}) {
  const text = [
    input.voiceoverText,
    ...input.scriptBeats.flatMap((beat) => [beat.voiceover, beat.visualCue]),
  ].join(" ").toLowerCase().replace(/ё/g, "е");
  const productWords = input.productName
    .toLowerCase()
    .replace(/ё/g, "е")
    .split(/[^a-zа-я0-9]+/iu)
    .filter((word) => word.length >= 4);
  return (
    productWords.some((word) => text.includes(word.slice(0, Math.max(4, word.length - 2)))) ||
    /коллаген|продукт|упаковк|баноч|пакет|желе|капсул|витамин|бад|саше|флакон|тюбик|коробк/iu.test(text)
  );
}

function selectReferenceUrl(
  role: ProductRole,
  avatarReference: string | null,
  productReference: OmniReferenceAsset | null
) {
  if (role === "hidden") return avatarReference;
  return productReference?.url || avatarReference;
}

function countWords(value: string) {
  return value.split(/\s+/).filter(Boolean).length;
}

function sumDurationsBefore(durations: readonly number[], index: number) {
  return durations.slice(0, index).reduce((sum, value) => sum + value, 0);
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
