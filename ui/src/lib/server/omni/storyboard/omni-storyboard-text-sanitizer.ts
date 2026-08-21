export function sanitizeFacelessStoryboardText(value: string) {
  return value
    .replace(/[^.;]*говор(?:ит|ить)\s+в\s+камеру[^.;]*/giu, "руки выполняют действие по текущей реплике")
    .replace(/(?:герой|персонаж)\s+смотрит\s+прямо\s+в\s+объектив/giu, "камера сохраняет тот же ракурс")
    .replace(/(?:герой|персонаж)\s+одной рукой/giu, "рука")
    .replace(/(?:герой|персонаж)/giu, "рука")
    .replace(/avatar\s+lower-left\s+cutout/giu, "approved hands-only framing");
}
