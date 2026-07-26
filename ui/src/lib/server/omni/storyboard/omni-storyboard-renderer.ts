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
    `используй раскадровку как референс для переходов и эффектов на видео а так же озвучки! ${OMNI_STORYBOARD_FILE_PLACEHOLDER}, эффекты и субтитры примени как с референса на русском языке, не добавляй музыку, аудиоэффекты можно`,
    "повтори в точности как с раскадровки даже кол-во переходов используй такой же ракурс камеры как на раскадровке",
  ].join("\n");
}
