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
  const avatarLocked = value.replace(
    /(?:главн(?:ый|ого)\s+)?(?:герой|персонаж|ведущ(?:ий|ая)|презентер|путешественник|мужчина|женщина|человек|фигура)|\b(?:presenter|traveler|man|woman|person|figure)\b/giu,
    "сохранённый аватар",
  );
  const sanitized = avatarLocked
    .replace(/сохранённый аватар(?:\s+(?:естественно|живо|спокойно|продолжает|свободно|уверенно|активно|снова|вновь)){0,3}\s+говорит\s+в\s+камеру/giu, "сохранённый аватар молча присутствует в кадре")
    .replace(/сохранённый аватар(?:\s+(?:естественно|живо|спокойно|продолжает|свободно|уверенно|активно|снова|вновь)){0,3}\s+смотрит\s+(?:прямо\s+)?в\s+(?:объектив|камеру)/giu, "сохранённый аватар сохраняет естественный B-roll взгляд вне объектива")
    .replace(/сохранённый аватар[^.;]{0,80}\b(?:speaks?|talks?)\b[^.;]*/giu, "сохранённый аватар молча выполняет B-roll действие")
    .replace(/,\s*(?:объясняя|рассказывая|произнося|комментируя|делая\s+акцент\s+на)[^.;]*/giu, "")
    .replace(/\b(?:говорит|рассказывает|объясняет|произносит|комментирует)\b[^.;]*/giu, "молча жестикулирует")
    .replace(/\btalking-head\s+(?:кадр|framing)\b/giu, "independent B-roll framing")
    .replace(/avatar\s+lower-left\s+cutout/giu, "independent B-roll framing");

  const withIdentityLock = /сохранённ(?:ый|ого)\s+аватар/iu.test(sanitized) && !/других\s+людей\s+в\s+кадре\s+нет/iu.test(sanitized)
    ? `${sanitized}; единственный видимый человек — сохранённый аватар, других людей в кадре нет`
    : sanitized;
  return /речь\s+звучит\s+за\s+кадром/iu.test(withIdentityLock) && !/сомкнут(?:ыми|ые)\s+губ/iu.test(withIdentityLock)
    ? `${withIdentityLock}; сохранённый аватар сохраняет нейтральное молчаливое выражение с сомкнутыми губами`
    : withIdentityLock;
}
