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
    "Используй раскадровку как главный референс для видео: повтори ракурсы камеры, действия, переходы, эффекты, субтитры и количество переходов точно как на раскадровке.",
    "Используй тот же персонаж, одежду, окружение и продукт из раскадровки и переданных референсов.",
    "Произнеси строго все слова озвучки из раскадровки на русском один раз, без повторов и добавлений.",
    "Музыку не добавляй. Можно только речь и аудиоэффекты как в раскадровке.",
  ].join("\n");
}
