import type { OmniStoryboardSegment } from "@/lib/omni/storyboard/omni-storyboard-types";

export function buildStoryboardImagePrompt(input: {
  segmentIndex: number;
  storyboard: OmniStoryboardSegment;
  productName: string;
  avatarReferenceUrl: string | null;
  productReferenceUrls?: readonly string[];
  directorReferenceImageUrls?: readonly string[];
  previousStoryboardReferenceUrl?: string | null;
}) {
  const avatarReferenceUrl = cleanUrl(input.avatarReferenceUrl);
  const productReferenceUrls = uniqueUrls(input.productReferenceUrls || []);
  const directorReferenceImageUrls = uniqueUrls(input.directorReferenceImageUrls || []);
  const previousStoryboardReferenceUrl = cleanUrl(input.previousStoryboardReferenceUrl);
  const productRange = productReferenceUrls.length > 1 ? `2-${productReferenceUrls.length + 1}` : "2";
  const directorRangeStart = productReferenceUrls.length + 2;
  const directorRangeEnd = directorRangeStart + directorReferenceImageUrls.length - 1;
  const directorRange = directorReferenceImageUrls.length > 1
    ? `${directorRangeStart}-${directorRangeEnd}`
    : String(directorRangeStart);
  const previousReferenceIndex = productReferenceUrls.length + directorReferenceImageUrls.length + 2;
  const frameCount = input.storyboard.frames.length;
  const frameNumbers = input.storyboard.frames.map((_, index) => String(index + 1)).join(", ");
  return [
    "Создай одну широкую production storyboard картинку в стиле темной UGC-раскадровки как референс для генерации Reels.",
    `Стандарт макета обязателен: черный фон, ровно ${frameCount} вертикальных карточек-кадров в один горизонтальный ряд, тонкие белые разделители, без второго ряда и без таблиц.`,
    "Каждая карточка состоит из большого визуального кадра сверху и небольшой черной зоны подсказок снизу.",
    `В левом верхнем углу каждой карточки нарисуй белый круг с номером кадра: ${frameNumbers}.`,
    "Внутри визуального кадра крупно напиши только реплику этого кадра на русском языке. Реплика должна совпадать дословно с полем РЕПЛИКА кадра.",
    "Реплика на кадре должна быть читаемой, белой, UGC-стиля, без рекламного дизайна и без дополнительных фраз.",
    "В нижней черной зоне каждой карточки добавь только маленькие серые подсказки для модели: РАКУРС: ...; МОНТАЖ: ...; ЭФФЕКТ: ...; SFX: ... .",
    "Не рисуй отдельные служебные блоки, верхние панели, нижние правила, карточки-инструкции или повторные thumbnails.",
    "Не добавляй UI соцсетей, кнопки приложения, водяные знаки, стрелки, стикеры или рекламные декоративные эффекты.",
    "Лицо героя должно выглядеть натурально: живое выражение, реальные поры, естественная текстура кожи, мягкий бытовой свет, без пластикового лица, beauty filter и лишнего сглаживания.",
    "Используй входные изображения как реальные визуальные референсы, а не как текстовые ссылки.",
    "Изображение 1 - наш аватар: лицо, возраст, телосложение, волосы и общий типаж героя.",
    `Изображения ${productRange} - реальный продукт: форма, цвет, упаковка, материал и размер.`,
    directorReferenceImageUrls.length
      ? `Изображения ${directorRange} - пять кадров именно этого сегмента оригинального reference-видео. Используй их для атмосферы, одежды, света, локации, динамики смены кадров и UGC-ракурсов, но не копируй лицо оригинального автора.`
      : "",
    previousStoryboardReferenceUrl
      ? `Изображение ${previousReferenceIndex} - предыдущая раскадровка этого же ролика. Используй ее как continuity reference: тот же стиль, персонаж, одежда, свет, окружение, масштаб продукта и тот же макет. Не копируй старые действия.`
      : "",
    "Каждый кадр должен быть отдельной вертикальной визуальной панелью с таймингом две секунды.",
    "Можно рисовать только минимальные монтажные и SFX-подсказки, которые помогают повторить раскадровку в видео.",
    "Главный герой в каждом кадре должен быть тем же человеком, что и на изображении один. Не меняй лицо, возраст, телосложение, волосы и общий типаж между кадрами.",
    "Одежда, стиль, свет и окружение должны оставаться одинаковыми во всех кадрах и между частями ролика. Не меняй цвет, тип одежды, посадку, аксессуары или прическу.",
    "Раскадровка должна быть динамичной: меняй крупность, угол камеры, жесты, положение рук, перебивки и микродействия, но сохраняй одного героя и один outfit.",
    "Первые два кадра должны быть особенно цепляющими: необычный selfie-ракурс, движение камеры, действие рукой, продуктовый POV, быстрый наклон или резкая смена крупности без прямой рекламной подачи.",
    "Если описание кадра говорит, что продукт виден, прорисуй именно продукт из входных изображений продукта, четко и детально.",
    "Не добавляй воду, стаканы, бутылки, шейкеры, напитки или растворение продукта, если это прямо не написано в кадре.",
    "Текст на картинке разрешен только как номер кадра, точная реплика кадра и нижние служебные подсказки. Не добавляй другие captions или рекламные надписи.",
    `Avatar reference URL: ${avatarReferenceUrl}.`,
    productReferenceUrls.length ? `Product reference URLs: ${productReferenceUrls.join(", ")}.` : "",
    directorReferenceImageUrls.length ? `Director reference image URLs: ${directorReferenceImageUrls.join(", ")}.` : "",
    previousStoryboardReferenceUrl ? `Previous storyboard reference URL: ${previousStoryboardReferenceUrl}.` : "",
    `Продукт: ${input.productName}.`,
    `Сегмент: ${input.segmentIndex}.`,
    ...input.storyboard.frames.map((frame, index) =>
      [
        `Кадр ${index + 1}, ${index * 2}-${(index + 1) * 2} сек:`,
        `РЕПЛИКА "${frame.spokenText}";`,
        `действие ${frame.visualAction};`,
        `камера ${frame.camera};`,
        `окружение ${frame.environment};`,
        `одежда ${frame.wardrobe};`,
        `продукт ${frame.productPlacement};`,
        `звук ${frame.sfxNotes};`,
        `монтаж и эффекты ${frame.effectNotes};`,
        "нижняя подсказка должна быть короткой: РАКУРС, МОНТАЖ, ЭФФЕКТ, SFX.",
      ].join(" ")
    ),
  ].filter(Boolean).join("\n");
}

function cleanUrl(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function uniqueUrls(values: readonly string[]) {
  const seen = new Set<string>();
  return values
    .map((value) => cleanUrl(value))
    .filter((value): value is string => Boolean(value))
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}
