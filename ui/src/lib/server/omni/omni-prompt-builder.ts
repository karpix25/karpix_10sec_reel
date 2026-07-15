import type { OmniClientAvatar, OmniGeneratedScript, OmniProduct, OmniReferenceAsset } from "@/lib/omni/types";
import type {
  CtaMode,
  LifeFormatId,
  OmniCreativeStrategy,
  OmniPromptValidationResult,
  OmniSegmentCreativePlan,
  ProductRole,
} from "@/lib/omni/creative-contract";
import { getOmniLifeFormat } from "./omni-life-formats";
import { extractDirectorBriefFromSnapshot, type DirectorBrief } from "./director-analysis-types";
import { renderDirectorBriefForOmniPrompt } from "./director-analysis-prompt";
import { buildDirectorSceneContract } from "./director-scene-contract";
import { selectOmniCreativeStrategy } from "./omni-format-selector";
import { splitScriptIntoVoiceSegments } from "./omni-script-segmentation";
import { assertOmniScriptTextContract, sanitizeOmniScriptText } from "./omni-script-text-contract";
import { validateOmniSegmentPrompt, validateVoiceoverSequence } from "./omni-prompt-validator";
import { getOmniSegmentWordBudget } from "./omni-duration-planner";
import { assertOmniCtaContract } from "./omni-cta-contract";
import { buildOmniCharacterContract, type OmniCharacterContract } from "./omni-character-contract";
import {
  buildTalkingHeadCreativePlan,
  isTalkingHeadCutawayFormat,
  OMNI_TALKING_HEAD_SYSTEM_PROMPT,
} from "./omni-talking-head-format";
import {
  isSimpleFullBodyProviderPromptStyle,
  OMNI_PROVIDER_CONTINUOUS_SYSTEM_PROMPT,
} from "./omni-provider-prompt-contract";
import { renderSimpleFullBodyUgcPrompt } from "./omni-simple-ugc-prompt";

export type OmniSegmentPrompt = {
  index: number;
  role: string;
  prompt: string;
  referenceUrl: string | null;
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
  const scriptText = sanitizeOmniScriptText(input.generatedScript?.script || input.legacyTranscript || input.brief || "");
  assertOmniScriptTextContract(scriptText);
  const voiceSegments = splitScriptIntoVoiceSegments(
    scriptText,
    input.segmentCount,
    getOmniSegmentWordBudget(input.segmentSeconds)
  );
  if (voiceSegments.length !== input.segmentCount) {
    throw new Error(`Script is too short for ${input.segmentCount} exact-speech Omni segments`);
  }

  const productReference = getPrimaryReference(input.product.product_refs);
  const avatarReference = input.avatar?.reference_url || null;
  const characterContract = buildOmniCharacterContract({
    product: input.product,
    avatar: input.avatar,
  });
  const directorBrief =
    input.directorBrief || extractDirectorBriefFromSnapshot(input.generatedScript?.source_snapshot);
  const directorGuidance = renderDirectorBriefForOmniPrompt(directorBrief);
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

  for (let index = 0; index < voiceSegments.length; index += 1) {
    const segmentIndex = index + 1;
    const segmentRole = getSegmentRole(segmentIndex, input.segmentCount);
    const productRole = getSegmentProductRole(
      strategy.productRole,
      segmentIndex,
      input.segmentCount,
      voiceSegments[index].text
    );
    const plan = buildSegmentCreativePlan({
      segmentIndex,
      voiceoverText: voiceSegments[index].text,
      strategy,
      productRole,
      segmentCount: input.segmentCount,
      segmentSeconds: input.segmentSeconds,
    });
    const prompt = isSimpleFullBodyProviderPromptStyle()
      ? renderSimpleFullBodyUgcPrompt({
          plan,
          strategy,
          characterContract,
          productName: input.product.name,
          segmentIndex,
          segmentCount: input.segmentCount,
          directorGuidance,
          directorBrief,
        })
      : renderSegmentPrompt(plan, strategy, characterContract, segmentIndex, input.segmentCount, directorGuidance, directorBrief);
    const validation = validateOmniSegmentPrompt({ prompt, plan });
    if (!validation.valid) {
      throw new Error(`Invalid Omni segment ${segmentIndex}: ${validation.errors.join(", ")}`);
    }
    prompts.push({
      index: segmentIndex,
      role: segmentRole,
      prompt,
      referenceUrl: selectReferenceUrl(segmentIndex, productRole, avatarReference, productReference),
      voiceoverText: plan.voiceoverText,
      creativeStrategy: strategy,
      creativePlan: plan,
      validation,
    });
  }

  if (!validateVoiceoverSequence(scriptText, prompts.map((item) => item.creativePlan))) {
    throw new Error("Omni voiceover segmentation changed the source script");
  }
  return prompts;
}

function buildSegmentCreativePlan(input: {
  segmentIndex: number;
  voiceoverText: string;
  strategy: OmniCreativeStrategy;
  productRole: ProductRole;
  segmentCount: number;
  segmentSeconds: number;
}): OmniSegmentCreativePlan {
  const format = getOmniLifeFormat(input.strategy.lifeFormatId);
  const sceneArc = input.strategy.visualStyle?.sceneArc ||
    format.sceneArcs.find((candidate) => candidate.setting === input.strategy.setting) ||
    format.sceneArcs[0];
  if (!sceneArc) throw new Error(`Omni life format ${format.id} has no scene arc`);
  const stateIndexes = getSceneStateIndexes(input.segmentIndex, input.segmentCount);
  const [opening, middle, closing] = stateIndexes.map((stateIndex) => sceneArc.states[stateIndex]);
  if (isTalkingHeadCutawayFormat(input.strategy.lifeFormatId)) {
    return buildTalkingHeadCreativePlan({ ...input, opening, closing });
  }
  const hookOpening = input.segmentIndex === 1
    ? buildHookOpening(input.strategy, opening)
    : `без сброса сцены продолжает из предыдущего положения: ${lowerFirst(opening)}`;
  const safeClosing = productClosingAction(closing, input.productRole);

  return {
    segmentIndex: input.segmentIndex,
    lifeFormatId: input.strategy.lifeFormatId,
    speechStartsAtSeconds: 0,
    voiceoverText: input.voiceoverText,
    productRole: input.productRole,
    continuityProps: input.strategy.continuityProps,
    beats: [
      { startSeconds: 0, endSeconds: 3, action: hookOpening },
      { startSeconds: 3, endSeconds: 7, action: middle },
      { startSeconds: 7, endSeconds: input.segmentSeconds, action: safeClosing },
    ],
  };
}

function buildHookOpening(strategy: OmniCreativeStrategy, baseAction: string) {
  const action = lowerFirst(baseAction);
  if (strategy.hookType === "problem_in_action") {
    return `${action}, причем неудобство из первых слов уже заметно в этом движении`;
  }
  if (strategy.hookType === "result_first") {
    return `${action}, а результат из первых слов уже виден в состоянии героя и не требует отдельной демонстрации`;
  }
  if (strategy.hookType === "contrast") {
    return `${action}, начиная со старого состояния, прямо названного в первых словах`;
  }
  if (strategy.hookType === "broken_expectation") {
    return `${action}, но ожидаемый ход этого действия сразу нарушается по смыслу первых слов`;
  }
  if (strategy.hookType === "unexpected_object") {
    return `${action} с единственным неожиданным предметом, прямо названным в первых словах`;
  }
  return `${action}, и это одно движение руками физически подтверждает первые слова`;
}

function renderSegmentPrompt(
  plan: OmniSegmentCreativePlan,
  strategy: OmniCreativeStrategy,
  characterContract: OmniCharacterContract,
  segmentIndex: number,
  segmentCount: number,
  directorGuidance: string | null,
  directorBrief: DirectorBrief | null
) {
  const directorScene = buildDirectorSceneContract(directorBrief);
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
    ...(talkingHead ? [
      "ФОРМАТ: ГОВОРЯЩАЯ ГОЛОВА С ПЕРЕБИВКАМИ. Основной кадр - лицо героя в камеру; перебивка - короткий спокойный insert без хореографии руками.",
    ] : []),
    directorScene?.sceneLine || `ЖИЗНЕННАЯ СИТУАЦИЯ: ${strategy.providerFormatDescription}. Место: ${strategy.setting}.`,
    `ГЛАВНЫЙ ПЕРСОНАЖ: ${characterContract.identityLine}.`,
    `ОДЕЖДА: ${directorScene?.wardrobeLine || characterContract.clothingLine}.`,
    `ИСТОЧНИКИ ОБРАЗА: ${characterContract.sourceRuleLine}.`,
    ...(strategy.visualStyle ? [
      `ВИЗУАЛЬНЫЙ СТИЛЬ СЦЕНАРИСТА: ${strategy.visualStyle.label}; ${strategy.visualStyle.visualTone}.`,
      directorScene?.cameraLightLine || `КАМЕРА И СВЕТ: ${strategy.visualStyle.cameraLanguage}; ${strategy.visualStyle.lighting}.`,
    ] : []),
    ...(directorGuidance ? [`РЕЖИССУРА ОРИГИНАЛА:\n${directorGuidance}`] : []),
    directorScene?.propPassportLine || `ПАСПОРТ РЕКВИЗИТА ДЛЯ ВСЕХ ЧАСТЕЙ: ${props}.`,
    `ТИП ХУКА: ${strategy.hookType}. ${strategy.hookRule}`,
    talkingHead
      ? "СТАРТ РЕЧИ: первое слово точной реплики звучит на 0.0 секунде в кадре говорящей головы; лицо уже видно, герой смотрит в камеру. До него нет паузы, улыбки, вдоха, приветствия или подготовки."
      : "СТАРТ РЕЧИ: первое слово точной реплики звучит в первом кадре на 0.0 секунде одновременно с уже начавшимся действием. До него нет паузы, улыбки, вдоха, приветствия или подготовки.",
    `ТОЧНАЯ РЕПЛИКА: "${plan.voiceoverText}"`,
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
  voiceoverText: string
): ProductRole {
  if (role === "hidden") return role;
  if (role === "background_prop") return segmentIndex === 1 ? "hidden" : role;
  if (segmentIndex !== segmentCount) return "hidden";
  return countWords(voiceoverText) > 18 ? "background_prop" : role;
}

function productRoleInstruction(role: ProductRole) {
  if (role === "hidden") return "продукт и упаковка не появляются; интерес создают история и результат.";
  if (role === "background_prop") return "продукт естественно лежит в сцене без акцента на логотипе и без позирования.";
  if (role === "brief_demo") return "один короткий показ по смыслу реплики, без рекламного крупного плана.";
  return "после последнего слова один раз взять продукт или убрать его; не открывать, не есть, не пить и не наносить в этом сегменте.";
}

function productClosingAction(action: string, role: ProductRole) {
  if (role === "hidden" || role === "background_prop") return action;
  if (role === "brief_demo") return "только после последнего слова берет продукт с поверхности и один раз показывает без крупного плана";
  return "только после последнего слова берет продукт с поверхности и оставляет в руке, не открывая и не употребляя";
}

function selectReferenceUrl(
  segmentIndex: number,
  role: ProductRole,
  avatarReference: string | null,
  productReference: OmniReferenceAsset | null
) {
  if (segmentIndex === 1 || role === "hidden") return avatarReference;
  return productReference?.url || avatarReference;
}

function getSceneStateIndexes(segmentIndex: number, segmentCount: number): [number, number, number] {
  if (segmentCount <= 3) {
    const start = (segmentIndex - 1) * 3;
    return [start, start + 1, start + 2];
  }
  const first = Math.round(((segmentIndex - 1) * 8) / segmentCount);
  const last = Math.round((segmentIndex * 8) / segmentCount);
  const middle = Math.round((first + last) / 2);
  return [first, middle, last];
}

function lowerFirst(value: string) {
  return value ? value[0].toLowerCase() + value.slice(1) : value;
}

function countWords(value: string) {
  return value.split(/\s+/).filter(Boolean).length;
}

function getPrimaryReference(refs: OmniReferenceAsset[]) {
  return refs.find((ref) => ref.is_primary && ref.kind === "image") || refs.find((ref) => ref.kind === "image") || null;
}

function getSegmentRole(index: number, total: number) {
  if (index === 1) return "hook";
  if (index === total) return "cta_or_payoff";
  return "body";
}
