import {
  validateOmniStoryboardSegment,
} from "../../../omni/storyboard/omni-storyboard-contract";
import type { OmniStoryboardSegment } from "../../../omni/storyboard/omni-storyboard-types";

export function renderCompactRussianOmniStoryboardPrompt(input: {
  storyboard: OmniStoryboardSegment;
}) {
  const validation = validateOmniStoryboardSegment(input.storyboard);
  if (!validation.valid) {
    throw new Error(`Invalid Omni storyboard: ${validation.errors.join(", ")}`);
  }

  const segment = validation.normalizedSegment;
  return [
    `Вертикальное 9:16 видео, ${segment.durationSeconds} секунд.`,
    "Стиль: нативный UGC, как живой ролик на телефон.",
    "Произнеси точную речь ниже один раз. Не повторяй слова, не перезапускай фразу, не добавляй и не перефразируй.",
    `Точная речь: ${segment.voiceoverText}`,
    "Следуй раскадровке как визуальному плану из пяти кадров примерно по две секунды.",
    "Кадр чистый и натуральный: только человек, продукт, окружение, речь и бытовые SFX. Свою музыку не добавляй.",
    "Раскадровка без повторного текста речи:",
    ...segment.frames.map((frame, index) => renderFrameLine(index + 1, frame)),
  ].join("\n");
}

function renderFrameLine(
  index: number,
  frame: OmniStoryboardSegment["frames"][number]
) {
  const startSeconds = (index - 1) * 2;
  const endSeconds = index * 2;
  return [
    `${index}) ${startSeconds}-${endSeconds} сек`,
    `действие: ${frame.visualAction}`,
    `ракурс: ${frame.camera}`,
    `среда: ${frame.environment}`,
    `одежда: ${frame.wardrobe}`,
    `продукт: ${frame.productPlacement}`,
    `SFX: ${frame.sfxNotes}${frame.effectNotes ? `; стиль: ${frame.effectNotes}` : ""}`,
  ].join(" | ");
}
