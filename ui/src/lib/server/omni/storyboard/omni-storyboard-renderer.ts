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
    "Генерируй речь и SFX из раскадровки. Свою музыку не добавляй.",
    `Точная речь: ${segment.voiceoverText}`,
    "Раскадровка:",
    ...segment.frames.map((frame, index) => renderFrameLine(index + 1, frame)),
  ].join("\n");
}

function renderFrameLine(
  index: number,
  frame: OmniStoryboardSegment["frames"][number]
) {
  return [
    `${index}) речь: "${frame.spokenText}"`,
    `действие: ${frame.visualAction}`,
    `ракурс: ${frame.camera}`,
    `среда: ${frame.environment}`,
    `одежда: ${frame.wardrobe}`,
    `продукт: ${frame.productPlacement}`,
    `SFX: ${frame.sfxNotes}${frame.effectNotes ? `; эффект: ${frame.effectNotes}` : ""}`,
  ].join(" | ");
}
