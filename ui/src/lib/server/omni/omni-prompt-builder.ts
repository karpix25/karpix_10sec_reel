import type { OmniClientAvatar, OmniGeneratedScript, OmniProduct, OmniReferenceAsset } from "@/lib/omni/types";
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
import { renderDirectorBriefForOmniPrompt } from "./director-analysis-prompt";
import { buildDirectorSceneContract } from "./director-scene-contract";
import { selectOmniCreativeStrategy } from "./omni-format-selector";
import { splitScriptIntoVoiceSegments, type VoiceSegment } from "./omni-script-segmentation";
import {
  extractGeneratedScriptBeatPlanFromSnapshot,
  renderScriptBeatGuidance,
  selectScriptBeatsForSegment,
} from "./script-beat-plan";
import { assertOmniScriptTextContract, sanitizeOmniScriptText } from "./omni-script-text-contract";
import { validateOmniSegmentPrompt, validateVoiceoverSequence } from "./omni-prompt-validator";
import { getOmniSegmentWordBudget } from "./omni-duration-planner";
import { assertOmniCtaContract } from "./omni-cta-contract";
import {
  buildOmniGenerationContinuityDirection,
  type OmniGenerationContinuityState,
} from "./omni-generation-continuity";
import { repairVoiceSegmentBoundaryRepeats } from "./omni-speech-boundary";
import { buildOmniCharacterContract, type OmniCharacterContract } from "./omni-character-contract";
import {
  isTalkingHeadCutawayFormat,
  OMNI_TALKING_HEAD_SYSTEM_PROMPT,
} from "./omni-talking-head-format";
import { buildSegmentCreativePlan } from "./omni-segment-creative-plan";
import {
  isSimpleFullBodyProviderPromptStyle,
  OMNI_PROVIDER_CONTINUOUS_SYSTEM_PROMPT,
} from "./omni-provider-prompt-contract";
import { renderSimpleFullBodyUgcPrompt } from "./omni-simple-ugc-prompt";
import { buildReferenceTransferPolicy, type ReferenceTransferPolicy } from "./omni-reference-transfer-policy";
import { applyDirectorLayoutToPlan, buildDirectorLayoutContract } from "./director-layout-contract";
import {
  buildProductVisualProfileFromText,
  extractProductVisualProfileFromSnapshot,
  normalizeProductVisualProfile,
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
  ctaMode?: CtaMode;
  ctaValue?: string | null;
  recentFormatIds?: readonly LifeFormatId[];
};

export const OMNI_PROMPT_WRITER_SYSTEM_PROMPT =
  OMNI_PROVIDER_CONTINUOUS_SYSTEM_PROMPT;

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
  const scriptPlan = extractGeneratedScriptBeatPlanFromSnapshot(input.generatedScript?.source_snapshot);

  const productReference = getPrimaryReference(input.product.product_refs);
  const productVisualProfile = resolveProductVisualProfile({
    product: input.product,
    generatedScript: input.generatedScript,
  });
  const productVisualPassport = renderProductVisualProfileForPrompt(productVisualProfile);
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
  const directorGuidance = referencePolicy.omitRawDirectorGuidance
    ? null
    : renderDirectorBriefForOmniPrompt(directorBrief);
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
    const prompt = isSimpleFullBodyProviderPromptStyle()
      ? renderSimpleFullBodyUgcPrompt({
          plan,
          strategy,
          characterContract,
          productName: input.product.name,
          productVisualPassport: segmentProductVisualPassport,
          segmentIndex,
          segmentCount: input.segmentCount,
          directorGuidance,
          directorBrief,
          referencePolicy,
          continuityDirection,
        })
      : renderSegmentPrompt(
          plan,
          strategy,
          characterContract,
          segmentIndex,
          input.segmentCount,
          directorGuidance,
          directorBrief,
          referencePolicy,
          segmentProductVisualPassport,
          continuityDirection.promptLines
        );
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

  if (!validateVoiceoverSequence(scriptText, prompts.map((item) => item.creativePlan))) {
    throw new Error("Omni voiceover segmentation changed the source script");
  }
  return prompts;
}

function renderSegmentPrompt(
  plan: OmniSegmentCreativePlan,
  strategy: OmniCreativeStrategy,
  characterContract: OmniCharacterContract,
  segmentIndex: number,
  segmentCount: number,
  directorGuidance: string | null,
  directorBrief: DirectorBrief | null,
  referencePolicy: ReferenceTransferPolicy,
  productVisualPassport: string | null,
  continuityLines: readonly string[]
) {
  const directorScene = buildDirectorSceneContract(directorBrief, referencePolicy);
  const scriptBeatGuidance = renderScriptBeatGuidance(plan.scriptBeats);
  const talkingHead = isTalkingHeadCutawayFormat(strategy.lifeFormatId);
  const continuity = segmentIndex < segmentCount
    ? talkingHead
      ? "Следующая часть может начаться новым монтажным кадром без продолжения позы или движения."
      : "Закончить в устойчивом положении, с которого следующая часть продолжит эту же ситуацию."
    : "Завершить точную реплику без дополнительной фразы или нового CTA.";
  const props = plan.continuityProps
    .map((item) => `${item.name}: ${item.appearance}; начальная позиция: ${item.initialPosition}`)
    .join(" | ");
  return [
    talkingHead ? OMNI_TALKING_HEAD_SYSTEM_PROMPT : OMNI_PROMPT_WRITER_SYSTEM_PROMPT,
    `Часть ${segmentIndex} из ${segmentCount}.`,
    ...(directorScene ? [directorScene.referenceLockLine, directorScene.framingLine] : []),
    ...(directorScene?.layoutLine ? [directorScene.layoutLine] : []),
    ...(talkingHead ? [
      "ФОРМАТ: ГОВОРЯЩАЯ ГОЛОВА С ПЕРЕБИВКАМИ. Основной кадр - лицо героя в камеру; перебивка - короткий спокойный insert без хореографии руками.",
    ] : []),
    directorScene?.sceneLine || `ЖИЗНЕННАЯ СИТУАЦИЯ: ${strategy.providerFormatDescription}. Место: ${strategy.setting}.`,
    `ГЛАВНЫЙ ПЕРСОНАЖ: ${characterContract.identityLine}.`,
    `ОДЕЖДА: ${directorScene?.wardrobeLine || characterContract.clothingLine}.`,
    `ИСТОЧНИКИ ОБРАЗА: ${characterContract.sourceRuleLine}.`,
    ...(strategy.visualStyle && !directorScene ? [
      `ВИЗУАЛЬНЫЙ СТИЛЬ СЦЕНАРИСТА: ${strategy.visualStyle.label}; ${strategy.visualStyle.visualTone}.`,
      `КАМЕРА И СВЕТ: ${strategy.visualStyle.cameraLanguage}; ${strategy.visualStyle.lighting}.`,
    ] : []),
    ...(directorScene ? [directorScene.cameraLightLine, directorScene.editingLine] : []),
    ...(directorGuidance ? [`РЕЖИССУРА ОРИГИНАЛА:\n${directorGuidance}`] : []),
    directorScene?.propPassportLine || `ПАСПОРТ РЕКВИЗИТА ДЛЯ ВСЕХ ЧАСТЕЙ: ${props}.`,
    ...(productVisualPassport ? [productVisualPassport] : []),
    ...continuityLines,
    `ТИП ХУКА: ${strategy.hookType}. ${strategy.hookRule}`,
    talkingHead
      ? "СТАРТ РЕЧИ: первое слово точной реплики звучит на 0.0 секунде в кадре говорящей головы; лицо уже видно, герой смотрит в камеру. До него нет паузы, улыбки, вдоха, приветствия или подготовки."
      : "СТАРТ РЕЧИ: первое слово точной реплики звучит в первом кадре на 0.0 секунде одновременно с уже начавшимся действием. До него нет паузы, улыбки, вдоха, приветствия или подготовки.",
    `ТОЧНАЯ РЕПЛИКА: "${plan.voiceoverText}"`,
    ...(scriptBeatGuidance ? [scriptBeatGuidance] : []),
    ...(directorScene ? [directorScene.actionLine] : []),
    talkingHead ? "ТРИ КАДРА ОДНОЙ ЧАСТИ:" : "ТРИ СОСТОЯНИЯ ОДНОГО МИНИ-ДЕЙСТВИЯ:",
    ...plan.beats.map((beat) => `${beat.startSeconds.toFixed(1)}-${beat.endSeconds.toFixed(1)} сек: ${beat.action}.`),
    `РОЛЬ ПРОДУКТА: ${productRoleInstruction(plan.productRole)}`,
    talkingHead
      ? "РЕЧЬ: произнести только точную реплику один раз, без добавлений, повторов и субтитров; во время короткой перебивки речь продолжает звучать как voiceover, без попытки синхронизировать губы вне кадра лица."
      : "РЕЧЬ: произнести только точную реплику один раз, без добавлений, повторов и субтитров; речь продолжается между состояниями действия.",
    talkingHead
      ? `МОНТАЖНАЯ НЕПРЕРЫВНОСТЬ: тот же человек, одежда, свет и локация. Перебивки короткие, спокойные, без новых персонажей и без сложных действий руками. Предметы из паспорта не меняют цвет, материал, форму, размер, детали и количество. Нельзя заменять, перекрашивать, дублировать или самовольно убирать предметы. Разрешены монтажные склейки между лицом и insert-кадром; не строить одно непрерывное бытовое действие. ${continuity}`
      : `НЕПРЕРЫВНОСТЬ: тот же человек, одежда, свет, локация и все предметы из паспорта. Цвет, материал, форма, размер, детали и количество каждого предмета неизменны. Нельзя заменять, перекрашивать, дублировать или самовольно убирать предметы. Их положение меняется только по перечисленным действиям. Первый кадр этой части точно продолжает финальные позиции предыдущей части. Один телефонный кадр без перебивок и рекламных крупных планов. ${continuity}`,
    `ЗАПРЕЩЕНО: ${[...strategy.forbiddenMotifs, ...strategy.safetyRules].join("; ")}.`,
  ].join("\n");
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

function productRoleInstruction(role: ProductRole) {
  if (role === "hidden") return "продукт и упаковка не появляются; интерес создают история и результат.";
  if (role === "background_prop") return "продукт существует как реальный предмет в сцене; когда виден, получает одно спокойное движение рукой или камерой без акцента на логотипе.";
  if (role === "brief_demo") return "один короткий физический показ по смыслу реплики: взять с поверхности, слегка повернуть, вернуть обратно без рекламного крупного плана.";
  return "использовать продукт как реальный предмет рутины; двигать только руками, не открывать, не есть, не пить и не наносить во время речи.";
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
