import type {
  LifeFormatId,
  OmniCreativeStrategy,
  OmniSegmentCreativePlan,
  ProductRole,
} from "@/lib/omni/creative-contract";
import { OMNI_CLEAN_FRAME_PROMPT } from "./omni-provider-prompt-contract";

export const TALKING_HEAD_CUTAWAY_FORMAT_ID: LifeFormatId = "talking_head_cutaways";

export const OMNI_TALKING_HEAD_SYSTEM_PROMPT =
  [
    "Сделай живое короткое вертикальное видео 9:16: говорящая голова с простыми перебивками.",
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
}): OmniSegmentCreativePlan {
  const cutaway = input.productRole === "hidden"
    ? "короткая спокойная перебивка на фон, стол или деталь интерьера без действия руками"
    : "короткая спокойная перебивка на продукт на столе без рук, без поворота упаковки и без рекламного крупного плана";
  const opening = input.segmentIndex === 1
    ? buildTalkingHeadHookOpening(input.strategy, input.opening)
    : `говорит в камеру новым монтажным кадром: ${lowerFirst(input.opening)}`;

  return {
    segmentIndex: input.segmentIndex,
    lifeFormatId: input.strategy.lifeFormatId,
    speechStartsAtSeconds: 0,
    voiceoverText: input.voiceoverText,
    productRole: input.productRole,
    continuityProps: input.strategy.continuityProps,
    beats: [
      { startSeconds: 0, endSeconds: 6.2, action: opening },
      { startSeconds: 6.2, endSeconds: 8.4, action: cutaway },
      { startSeconds: 8.4, endSeconds: input.segmentSeconds, action: `возврат к лицу героя: ${lowerFirst(input.closing)}` },
    ],
  };
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
