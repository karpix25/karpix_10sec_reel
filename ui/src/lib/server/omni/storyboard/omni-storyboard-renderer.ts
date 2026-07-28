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
}) {
  const validation = validateOmniStoryboardSegment(input.storyboard);
  if (!validation.valid) {
    throw new Error(`Invalid Omni storyboard: ${validation.errors.join(", ")}`);
  }
  const voiceoverText = input.storyboard.voiceoverText.trim();

  return [
    `Создай видео по раскадровке ${OMNI_STORYBOARD_FILE_PLACEHOLDER}.`,
    `Используй точно такой же визуал как в раскадровке ${OMNI_STORYBOARD_FILE_PLACEHOLDER}.`,
    `Оживи кадры раскадровки ${OMNI_STORYBOARD_FILE_PLACEHOLDER} как реальные сцены, не показывай саму раскадровку, телефон, экран, интерфейс, соцсети, карточки или коллаж.`,
    `Лицо и личность персонажа бери из avatar/character reference; одежду, свет, фон, ракурс и действия бери из раскадровки ${OMNI_STORYBOARD_FILE_PLACEHOLDER}.`,
    "Сохраняй те же волосы, пробор, аксессуары, посадку одежды, вырез, рукава и фактуру ткани во всех кадрах.",
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
