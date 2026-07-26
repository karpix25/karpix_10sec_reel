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
    `создай обычное вертикальное 9:16 видео, используя раскадровку только как скрытый референс для ракурсов, действий, одежды, атмосферы, монтажа, переходов, эффектов и аудиоэффектов! ${OMNI_STORYBOARD_FILE_PLACEHOLDER}`,
    "не показывай саму раскадровку в видео: без панелей, номеров кадров, черного фона, служебных подсказок, карточек, текста раскадровки и коллажа",
    "повтори в точности количество сцен и переходов как на раскадровке, используй такие же ракурсы камеры, действия, одежду, свет и окружение",
    "персонаж в кадре сам произносит только реплики, написанные внутри кадров раскадровки, на русском языке с синхронным движением губ",
    "не используй закадровый голос, диктора или фоновую озвучку",
    "говори бодро и плотно с первой секунды, без длинных пауз между словами",
    "произнеси все реплики из раскадровки до конца, включая последнюю фразу и призыв",
    "слова произноси в точности как написано на раскадровке, один раз, без повторов, переводов и добавлений",
    "не добавляй музыку, новые субтитры или новый текст на экран, аудиоэффекты можно",
  ].join("\n");
}
