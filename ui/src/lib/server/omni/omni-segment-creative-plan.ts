import type {
  OmniCreativeStrategy,
  OmniScriptBeatCue,
  OmniSegmentCreativePlan,
  ProductRole,
} from "@/lib/omni/creative-contract";
import { getOmniLifeFormat } from "./omni-life-formats";
import {
  buildTalkingHeadCreativePlan,
  isTalkingHeadCutawayFormat,
} from "./omni-talking-head-format";
import { OMNI_PRODUCT_BROLL_RULE } from "./omni-product-broll-contract";
import { sanitizeProviderVisualCue } from "./script-beat-plan";

export function buildSegmentCreativePlan(input: {
  segmentIndex: number;
  voiceoverText: string;
  strategy: OmniCreativeStrategy;
  productRole: ProductRole;
  segmentCount: number;
  segmentSeconds: number;
  scriptBeats: OmniScriptBeatCue[];
}): OmniSegmentCreativePlan {
  const format = getOmniLifeFormat(input.strategy.lifeFormatId);
  const sceneArc = input.strategy.visualStyle?.sceneArc ||
    format.sceneArcs.find((candidate) => candidate.setting === input.strategy.setting) ||
    format.sceneArcs[0];
  if (!sceneArc) throw new Error(`Omni life format ${format.id} has no scene arc`);
  if (input.strategy.referenceSceneMode === "voiceover_broll") {
    return addScriptBeatCues(buildVoiceoverBrollCreativePlan(input), input.scriptBeats);
  }
  const stateIndexes = getSceneStateIndexes(input.segmentIndex, input.segmentCount);
  const [opening, middle, closing] = stateIndexes.map((stateIndex) => sceneArc.states[stateIndex]);
  if (isTalkingHeadCutawayFormat(input.strategy.lifeFormatId)) {
    return addScriptBeatCues(buildTalkingHeadCreativePlan({ ...input, opening, closing }), input.scriptBeats);
  }
  const hookOpening = input.segmentIndex === 1
    ? buildHookOpening(input.strategy, opening)
    : `без сброса сцены продолжает из предыдущего положения: ${lowerFirst(opening)}`;
  const safeClosing = productClosingAction(closing, input.productRole);
  const timing = buildContinuousActionTiming(input.segmentSeconds);

  return addScriptBeatCues({
    segmentIndex: input.segmentIndex,
    lifeFormatId: input.strategy.lifeFormatId,
    speechStartsAtSeconds: 0,
    voiceoverText: input.voiceoverText,
    productRole: input.productRole,
    referenceSceneMode: input.strategy.referenceSceneMode,
    continuityProps: input.strategy.continuityProps,
    scriptBeats: input.scriptBeats,
    beats: [
      { startSeconds: 0, endSeconds: timing.openingEndSeconds, action: hookOpening },
      { startSeconds: timing.openingEndSeconds, endSeconds: timing.middleEndSeconds, action: middle },
      { startSeconds: timing.middleEndSeconds, endSeconds: input.segmentSeconds, action: safeClosing },
    ],
  }, input.scriptBeats);
}

function buildVoiceoverBrollCreativePlan(input: {
  segmentIndex: number;
  voiceoverText: string;
  strategy: OmniCreativeStrategy;
  productRole: ProductRole;
  segmentSeconds: number;
  scriptBeats: OmniScriptBeatCue[];
}) {
  const timing = buildContinuousActionTiming(input.segmentSeconds);
  const productRule = input.productRole === "hidden" ? "продукт остается вне кадра" : OMNI_PRODUCT_BROLL_RULE;
  return {
    segmentIndex: input.segmentIndex,
    lifeFormatId: input.strategy.lifeFormatId,
    referenceSceneMode: input.strategy.referenceSceneMode,
    speechStartsAtSeconds: 0 as const,
    voiceoverText: input.voiceoverText,
    productRole: input.productRole,
    continuityProps: input.strategy.continuityProps,
    scriptBeats: input.scriptBeats,
    beats: [
      { startSeconds: 0, endSeconds: timing.openingEndSeconds, action: `независимая B-roll сцена по хуку; голос за кадром; ${productRule}` },
      { startSeconds: timing.openingEndSeconds, endSeconds: timing.middleEndSeconds, action: `смысловая B-roll перебивка по текущей реплике; голос за кадром; ${productRule}` },
      { startSeconds: timing.middleEndSeconds, endSeconds: input.segmentSeconds, action: `финальная независимая B-roll сцена по текущей реплике; голос за кадром; ${productRule}` },
    ] as const,
  } satisfies OmniSegmentCreativePlan;
}

function buildContinuousActionTiming(segmentSeconds: number) {
  const openingEndSeconds = clamp(roundOne(segmentSeconds * 0.3), 1, segmentSeconds - 2);
  const middleEndSeconds = clamp(roundOne(segmentSeconds * 0.7), openingEndSeconds + 0.8, segmentSeconds - 0.5);
  return {
    openingEndSeconds: roundOne(openingEndSeconds),
    middleEndSeconds: roundOne(middleEndSeconds),
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

function productClosingAction(action: string, role: ProductRole) {
  return role === "hidden" ? action : OMNI_PRODUCT_BROLL_RULE;
}

function addScriptBeatCues(
  plan: OmniSegmentCreativePlan,
  scriptBeats: readonly OmniScriptBeatCue[]
): OmniSegmentCreativePlan {
  if (!scriptBeats.length) return plan;
  const visualCues = scriptBeats.map((beat) => beat.visualCue).filter(Boolean);
  if (!visualCues.length) return { ...plan, scriptBeats };
  return {
    ...plan,
    scriptBeats,
    beats: plan.beats.map((beat, index) => {
      const cue = sanitizeProviderVisualCue(visualCues[Math.min(index, visualCues.length - 1)] || "");
      return {
        ...beat,
        action: cue ? `${beat.action}. Сценарный visual cue: ${cue}` : beat.action,
      };
    }) as unknown as OmniSegmentCreativePlan["beats"],
  };
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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}
