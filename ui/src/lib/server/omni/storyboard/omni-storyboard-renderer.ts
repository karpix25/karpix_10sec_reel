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
    `создай обычное вертикальное 9:16 видео, используя раскадровку только как скрытый референс для ракурсов, действий, монтажа, переходов, эффектов и аудиоэффектов! ${OMNI_STORYBOARD_FILE_PLACEHOLDER}`,
    "не показывай саму раскадровку в видео: без панелей, номеров кадров, черного фона, служебных подсказок, карточек и коллажа",
    "повтори в точности количество сцен и переходов как на раскадровке, используй такой же ракурс камеры",
    `Озвучка: ${input.storyboard.voiceoverText}`,
    "Озвучка должна быть только на русском языке, не переводи слова на другой язык",
    "персонаж в кадре сам произносит эти слова с синхронным движением губ, это не закадровый голос и не фоновый диктор",
    "Озвучивай слова в точности как написано, один раз, без повторов и добавлений",
    "не добавляй музыку и субтитры, аудиоэффекты можно",
  ].join("\n");
}
