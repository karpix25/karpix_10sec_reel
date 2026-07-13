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
import { selectOmniCreativeStrategy } from "./omni-format-selector";
import { splitScriptIntoVoiceSegments } from "./omni-script-segmentation";
import { validateOmniSegmentPrompt, validateVoiceoverSequence } from "./omni-prompt-validator";

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
  targetAudience?: string | null;
  ctaMode?: CtaMode;
  ctaValue?: string | null;
  recentFormatIds?: readonly LifeFormatId[];
};

export const OMNI_PROMPT_WRITER_SYSTEM_PROMPT =
  "Сделай живой короткий Reels одним непрерывным телефонным кадром. Описывай только физически выполнимые действия и точную речь.";

export function buildOmniSegmentPrompts(input: BuildOmniPromptsInput): OmniSegmentPrompt[] {
  const scriptText = input.generatedScript?.script || input.legacyTranscript || input.brief || "";
  const voiceSegments = splitScriptIntoVoiceSegments(scriptText, input.segmentCount);
  if (voiceSegments.length !== input.segmentCount) {
    throw new Error(`Script is too short for ${input.segmentCount} exact-speech Omni segments`);
  }

  const productReference = getPrimaryReference(input.product.product_refs);
  const avatarReference = input.avatar?.reference_url || null;
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
  assertCtaContract(scriptText, strategy);
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
    const prompt = renderSegmentPrompt(plan, strategy, segmentIndex, input.segmentCount);
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
  const sceneArc = format.sceneArcs.find((candidate) => candidate.setting === input.strategy.setting) || format.sceneArcs[0];
  if (!sceneArc) throw new Error(`Omni life format ${format.id} has no scene arc`);
  const stateIndexes = getSceneStateIndexes(input.segmentIndex, input.segmentCount);
  const [opening, middle, closing] = stateIndexes.map((stateIndex) => sceneArc.states[stateIndex]);
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
  segmentIndex: number,
  segmentCount: number
) {
  const continuity = segmentIndex < segmentCount
    ? "Закончить в устойчивом положении, с которого следующая часть продолжит эту же ситуацию."
    : "Завершить точную реплику без дополнительной фразы или нового CTA.";
  return [
    OMNI_PROMPT_WRITER_SYSTEM_PROMPT,
    `Часть ${segmentIndex} из ${segmentCount}.`,
    `ЖИЗНЕННАЯ СИТУАЦИЯ: ${strategy.providerFormatDescription}. Место: ${strategy.setting}.`,
    `ТИП ХУКА: ${strategy.hookType}. ${strategy.hookRule}`,
    "СТАРТ РЕЧИ: первое слово точной реплики звучит в первом кадре на 0.0 секунде одновременно с уже начавшимся действием. До него нет паузы, улыбки, вдоха, приветствия или подготовки.",
    `ТОЧНАЯ РЕПЛИКА: "${plan.voiceoverText}"`,
    "ТРИ СОСТОЯНИЯ ОДНОГО МИНИ-ДЕЙСТВИЯ:",
    ...plan.beats.map((beat) => `${beat.startSeconds.toFixed(1)}-${beat.endSeconds.toFixed(1)} сек: ${beat.action}.`),
    `РОЛЬ ПРОДУКТА: ${productRoleInstruction(plan.productRole)}`,
    "РЕЧЬ: произнести только точную реплику один раз, без добавлений, повторов и субтитров; речь продолжается между состояниями действия.",
    `НЕПРЕРЫВНОСТЬ: тот же человек, одежда, свет и бытовая локация. Один телефонный кадр без перебивок и рекламных крупных планов. ${continuity}`,
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

function assertCtaContract(script: string, strategy: OmniCreativeStrategy) {
  const normalized = script.toLowerCase().replace(/ё/g, "е");
  const asksForComment = /напиш|коммент|кодово.*слов/iu.test(normalized);
  const mentionsProfileLink = /ссылк.*(?:профил|био)/iu.test(normalized);
  const mentionsArticle = /артикул|описани/iu.test(normalized);
  if (strategy.ctaMode === "keyword_in_comments" && (mentionsProfileLink || mentionsArticle)) {
    throw new Error("Script CTA conflicts with keyword_in_comments product contract");
  }
  if (strategy.ctaMode === "keyword_in_comments" && strategy.ctaValue && asksForComment &&
      !normalized.includes(strategy.ctaValue.toLowerCase())) {
    throw new Error("Script CTA uses a different comment keyword");
  }
  if (strategy.ctaMode === "keyword_in_comments" &&
      (!asksForComment || !strategy.ctaValue || !normalized.includes(strategy.ctaValue.toLowerCase()))) {
    throw new Error("Script is missing the required comment keyword CTA");
  }
  if (strategy.ctaMode === "link_in_profile" && (asksForComment || mentionsArticle)) {
    throw new Error("Script CTA conflicts with link_in_profile product contract");
  }
  if (strategy.ctaMode === "link_in_profile" && !mentionsProfileLink) {
    throw new Error("Script is missing the required profile link CTA");
  }
  if (strategy.ctaMode === "article_in_description" && (asksForComment || mentionsProfileLink)) {
    throw new Error("Script CTA conflicts with article_in_description product contract");
  }
  if (strategy.ctaMode === "article_in_description" && !mentionsArticle) {
    throw new Error("Script is missing the required article-in-description CTA");
  }
  if (strategy.ctaMode === "no_explicit_cta" && (asksForComment || mentionsProfileLink || mentionsArticle)) {
    throw new Error("Script has an explicit CTA while product contract disables it");
  }
}

function getPrimaryReference(refs: OmniReferenceAsset[]) {
  return refs.find((ref) => ref.is_primary && ref.kind === "image") || refs.find((ref) => ref.kind === "image") || null;
}

function getSegmentRole(index: number, total: number) {
  if (index === 1) return "hook";
  if (index === total) return "cta_or_payoff";
  return "body";
}
