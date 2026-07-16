import type {
  LifeFormatId,
  OmniCreativeStrategy,
  OmniScriptBeatCue,
  OmniSegmentCreativePlan,
  ProductRole,
} from "@/lib/omni/creative-contract";
import { OMNI_CLEAN_FRAME_PROMPT } from "./omni-provider-prompt-contract";
import { sanitizeProviderVisualCue } from "./script-beat-plan";

export const TALKING_HEAD_CUTAWAY_FORMAT_ID: LifeFormatId = "talking_head_cutaways";

export const OMNI_TALKING_HEAD_SYSTEM_PROMPT =
  [
    "Сделай живую видеозапись человека в формате 9:16: говорящая голова с простыми статичными перебивками.",
    OMNI_CLEAN_FRAME_PROMPT,
    "Главный кадр - лицо в камеру, перебивки короткие и статичные.",
  ].join(" ");

export function isTalkingHeadCutawayFormat(formatId: LifeFormatId) {
  return formatId === TALKING_HEAD_CUTAWAY_FORMAT_ID;
}

export function buildTalkingHeadCreativePlan(input: {
  segmentIndex: number;
  voiceoverText: string;
  strategy: OmniCreativeStrategy;
  productRole: ProductRole;
  segmentSeconds: number;
  opening: string;
  closing: string;
  scriptBeats?: OmniScriptBeatCue[];
}): OmniSegmentCreativePlan {
  const scriptCue = renderScriptCueSummary(input.scriptBeats);
  const cueOpening = sanitizeProviderVisualCue(input.scriptBeats?.[0]?.visualCue || "");
  const cueClosing = sanitizeProviderVisualCue(input.scriptBeats?.[input.scriptBeats.length - 1]?.visualCue || "");
  const cutaway = cueCutaway(input.scriptBeats, input.productRole) || (input.productRole === "hidden"
    ? "короткая спокойная перебивка на фон, стол или деталь интерьера без действия руками"
    : "короткая спокойная перебивка на продукт на столе без рук, без поворота упаковки и без рекламного крупного плана");
  const opening = input.segmentIndex === 1
    ? buildTalkingHeadHookOpening(input.strategy, input.opening)
    : `говорит в камеру новым монтажным кадром: ${lowerFirst(input.opening)}`;
  const guidedOpening = cueOpening
    ? `говорит в камеру по visual cue сценариста: ${cueOpening}; ${lowerFirst(opening)}`
    : opening;
  const guidedClosing = cueClosing && cueClosing !== cueOpening
    ? `возврат к лицу героя по visual cue сценариста: ${cueClosing}`
    : `возврат к лицу героя: ${lowerFirst(input.closing)}`;
  const timing = buildTalkingHeadTiming(input.segmentSeconds);

  return {
    segmentIndex: input.segmentIndex,
    lifeFormatId: input.strategy.lifeFormatId,
    speechStartsAtSeconds: 0,
    voiceoverText: input.voiceoverText,
    productRole: input.productRole,
    continuityProps: input.strategy.continuityProps,
    scriptBeats: input.scriptBeats || [],
    beats: [
      { startSeconds: 0, endSeconds: timing.faceEndSeconds, action: withScriptCue(guidedOpening, scriptCue) },
      { startSeconds: timing.faceEndSeconds, endSeconds: timing.cutawayEndSeconds, action: cutaway },
      { startSeconds: timing.cutawayEndSeconds, endSeconds: input.segmentSeconds, action: guidedClosing },
    ],
  };
}

function buildTalkingHeadTiming(segmentSeconds: number) {
  const faceEndSeconds = clamp(roundOne(segmentSeconds * 0.62), 1.6, segmentSeconds - 1.2);
  const cutawayEndSeconds = clamp(roundOne(segmentSeconds * 0.84), faceEndSeconds + 0.6, segmentSeconds - 0.2);
  return {
    faceEndSeconds: roundOne(faceEndSeconds),
    cutawayEndSeconds: roundOne(cutawayEndSeconds),
  };
}

function cueCutaway(scriptBeats: readonly OmniScriptBeatCue[] | undefined, productRole: ProductRole) {
  const cutawayBeat = scriptBeats?.find((beat) => /перебив|insert|продукт|product|стол|фон|детал/iu.test(beat.visualCue));
  if (!cutawayBeat) return "";
  const productRule = productRole === "hidden"
    ? "без показа продукта, если он не нужен в этой части"
    : "если в cue есть продукт, показывать только новый продукт";
  return `короткая спокойная перебивка по visual cue сценариста: ${sanitizeProviderVisualCue(cutawayBeat.visualCue)}; ${productRule}; без субтитров и сложной хореографии`;
}

function renderScriptCueSummary(scriptBeats: readonly OmniScriptBeatCue[] | undefined) {
  if (!scriptBeats?.length) return "";
  return scriptBeats.map((beat) => `${beat.stage}: ${sanitizeProviderVisualCue(beat.visualCue)}`).join(" | ");
}

function withScriptCue(action: string, scriptCue: string) {
  return scriptCue ? `${action}; сценарный visual plan: ${scriptCue}` : action;
}

function buildTalkingHeadHookOpening(strategy: OmniCreativeStrategy, baseAction: string) {
  const action = lowerFirst(baseAction);
  if (strategy.hookType === "problem_in_action") {
    return `${action}; проблема из первых слов читается в интонации и выражении лица, без бытового действия`;
  }
  if (strategy.hookType === "result_first") {
    return `${action}; результат из первых слов передается уверенностью героя и спокойным взглядом в камеру`;
  }
  if (strategy.hookType === "contrast") {
    return `${action}; контраст старого и нового состояния объясняется речью, без демонстрации сложного предметного действия`;
  }
  if (strategy.hookType === "broken_expectation") {
    return `${action}; неожиданность держится на первой фразе и реакции лица, а не на реквизите`;
  }
  return `${action}; смысл доказывает речь и мимика, а не действие руками`;
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
