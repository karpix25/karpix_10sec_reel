import {
  validateOmniStoryboardSegment,
} from "../../../omni/storyboard/omni-storyboard-contract";
import type { OmniStoryboardSegment } from "../../../omni/storyboard/omni-storyboard-types";
import {
  OMNI_PRODUCT_FILE_PLACEHOLDER,
  OMNI_STORYBOARD_FILE_PLACEHOLDER,
} from "./omni-storyboard-file-reference";

export function renderCompactRussianOmniStoryboardPrompt(input: {
  storyboard: OmniStoryboardSegment;
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
    `Продукт бери из ${OMNI_PRODUCT_FILE_PLACEHOLDER}, не меняй упаковку, цвет, форму и этикетку.`,
    "Персонаж в кадре сам произносит эти слова на русском языке:",
    voiceoverText,
    "Не дублируй слова.",
    "Не добавляй музыку, новые субтитры или новый текст на экран, аудиоэффекты можно.",
  ].join("\n");
}
