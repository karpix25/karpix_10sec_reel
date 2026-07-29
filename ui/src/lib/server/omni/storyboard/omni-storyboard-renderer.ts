import {
  validateOmniStoryboardSegment,
} from "../../../omni/storyboard/omni-storyboard-contract";
import type { OmniStoryboardSegment } from "../../../omni/storyboard/omni-storyboard-types";
import {
  OMNI_PRODUCT_FILE_PLACEHOLDER,
  OMNI_STORYBOARD_FILE_PLACEHOLDER,
} from "./omni-storyboard-file-reference";
import { renderProductPhysicalContractForOmni } from "../product-physical-contract";

export function renderCompactRussianOmniStoryboardPrompt(input: {
  storyboard: OmniStoryboardSegment;
  productPhysicalContract?: string | null;
  segmentCount?: number;
}) {
  const validation = validateOmniStoryboardSegment(input.storyboard);
  if (!validation.valid) {
    throw new Error(`Invalid Omni storyboard: ${validation.errors.join(", ")}`);
  }
  const voiceoverText = renderPunctuatedVoiceover(input.storyboard, input.segmentCount);
  const frameCount = input.storyboard.frames.length;

  return [
    `Создай видео по раскадровке ${OMNI_STORYBOARD_FILE_PLACEHOLDER}.`,
    `Используй точно такой же визуал как в раскадровке ${OMNI_STORYBOARD_FILE_PLACEHOLDER}.`,
    `Структура видео: ровно ${frameCount} живых эпизодов в том же порядке, один эпизод на каждый кадр раскадровки.`,
    `Оживи кадры раскадровки ${OMNI_STORYBOARD_FILE_PLACEHOLDER} как реальные сцены, не показывай саму раскадровку, телефон, экран, интерфейс, соцсети, карточки или коллаж.`,
    `Лицо и личность персонажа бери из avatar/character reference; одежду, свет, фон, ракурс и действия бери из раскадровки ${OMNI_STORYBOARD_FILE_PLACEHOLDER}.`,
    "Сохраняй те же волосы, пробор, аксессуары, посадку одежды, вырез, рукава и фактуру ткани во всех кадрах.",
    "Одежда это один и тот же комплект на весь ролик: не снимай пиджак/жакет/рубашку, не заменяй слой футболкой или другой рубашкой между частями.",
    "В каждом talking-head кадре персонаж смотрит прямо в объектив, даже при смене ракурса камеры.",
    `Продукт бери из ${OMNI_PRODUCT_FILE_PLACEHOLDER}, не меняй упаковку, цвет, форму и этикетку.`,
    "Состояние продукта держи одинаковым от первого до последнего кадра: та же консистенция, та же целостность, та же упаковка и дизайн.",
    renderProductPhysicalContractForOmni(input.productPhysicalContract),
    "Персонаж в кадре сам произносит эти слова на русском языке:",
    voiceoverText,
    "Не дублируй слова.",
    "Не добавляй музыку, новые субтитры или новый текст на экран, аудиоэффекты можно.",
  ].join("\n");
}

function renderPunctuatedVoiceover(storyboard: OmniStoryboardSegment, segmentCount?: number) {
  const text = storyboard.voiceoverText.trim();
  if (/[?!]$/u.test(text)) return text;
  const mark = storyboard.segmentIndex === 1
    ? renderHookMark(text)
    : segmentCount && storyboard.segmentIndex === segmentCount
      ? "!"
      : "";
  return mark ? `${text.replace(/[.!…]+$/u, "")}${mark}` : text;
}

function renderHookMark(text: string) {
  return /^(?:почему|зачем|как|что|когда|если|вы|ты|знаете|знаешь)\b/iu.test(text) ? "?" : "!";
}
