import {
  validateOmniStoryboardSegment,
} from "../../../omni/storyboard/omni-storyboard-contract";
import type { OmniStoryboardSegment } from "../../../omni/storyboard/omni-storyboard-types";
import { OMNI_STORYBOARD_FILE_PLACEHOLDER } from "./omni-storyboard-file-reference";

export function renderCompactRussianOmniStoryboardPrompt(input: {
  storyboard: OmniStoryboardSegment;
}) {
  const validation = validateOmniStoryboardSegment(input.storyboard);
  if (!validation.valid) {
    throw new Error(`Invalid Omni storyboard: ${validation.errors.join(", ")}`);
  }

  return [
    `используй раскадровку как референс для ракурсов, действий, монтажа, переходов, эффектов и аудиоэффектов! ${OMNI_STORYBOARD_FILE_PLACEHOLDER}`,
    "повтори в точности количество кадров и переходов как на раскадровке, используй такой же ракурс камеры",
    `Озвучка: ${input.storyboard.voiceoverText}`,
    "Озвучка должна быть только на русском языке, не переводи слова на другой язык",
    "Озвучивай слова в точности как написано, один раз, без повторов и добавлений",
    "не добавляй музыку и субтитры, аудиоэффекты можно",
  ].join("\n");
}
