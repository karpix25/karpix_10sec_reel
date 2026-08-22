export function sanitizeFacelessStoryboardText(value: string, referenceSceneMode?: string) {
  if (referenceSceneMode === "object_only") {
    return value
      .replace(/[^.;]*говор(?:ит|ить)\s+в\s+камеру[^.;]*/giu, "концептуальный проп выполняет действие по текущей реплике")
      .replace(/(?:герой|персонаж)\s+смотрит\s+прямо\s+в\s+объектив/giu, "камера сохраняет тот же ракурс")
      .replace(/(?:герой|персонаж)/giu, "концептуальный 3D-проп")
      .replace(/avatar\s+lower-left\s+cutout/giu, "approved object-only framing");
  }
  return value
    .replace(/[^.;]*говор(?:ит|ить)\s+в\s+камеру[^.;]*/giu, "руки выполняют действие по текущей реплике")
    .replace(/(?:герой|персонаж)\s+смотрит\s+прямо\s+в\s+объектив/giu, "камера сохраняет тот же ракурс")
    .replace(/(?:герой|персонаж)\s+одной рукой/giu, "рука")
    .replace(/(?:герой|персонаж)/giu, "рука")
    .replace(/avatar\s+lower-left\s+cutout/giu, "approved hands-only framing");
}

export function sanitizeVoiceoverBrollStoryboardText(value: string) {
  return value
    .replace(/(?:герой|персонаж)(?:\s+(?:естественно|живо|спокойно|продолжает|свободно|уверенно|активно|снова|вновь)){0,3}\s+говорит\s+в\s+камеру/giu, "видимый B-roll субъект естественно присутствует в кадре")
    .replace(/(?:герой|персонаж)(?:\s+(?:естественно|живо|спокойно|продолжает|свободно|уверенно|активно|снова|вновь)){0,3}\s+смотрит\s+(?:прямо\s+)?в\s+(?:объектив|камеру)/giu, "камера сохраняет соответствующий reference-ракурс")
    .replace(/\btalking-head\s+(?:кадр|framing)\b/giu, "independent B-roll framing")
    .replace(/главн(?:ый|ого)\s+персонаж/giu, "видимый B-roll субъект")
    .replace(/avatar\s+lower-left\s+cutout/giu, "independent B-roll framing");
}
