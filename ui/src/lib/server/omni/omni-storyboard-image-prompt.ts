import type { OmniStoryboardSegment } from "@/lib/omni/storyboard/omni-storyboard-types";
import { isProductVisibleInStoryboardFrame } from "./omni-intro-product-contract";
import { renderProductPhysicalStoryboardHint } from "./product-physical-contract";

export function buildStoryboardImagePrompt(input: {
  segmentIndex: number;
  storyboard: OmniStoryboardSegment;
  productName: string;
  productPhysicalContract?: string | null;
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
  const productPhysicalHint = productReferenceUrls.length
    ? renderProductPhysicalStoryboardHint(input.productPhysicalContract)
    : "";
  const frameCount = input.storyboard.frames.length;
  const frameNumbers = input.storyboard.frames.map((_, index) => String(index + 1)).join(", ");
  const productFrameNumbers = input.storyboard.frames
    .map((frame, index) => isProductVisibleInStoryboardFrame(frame as unknown as Record<string, unknown>, input.productName) ? index + 1 : null)
    .filter((index): index is number => index !== null);
  return [
    "Создай одну широкую production storyboard картинку в стиле темной UGC-раскадровки как референс для генерации Reels.",
    `Стандарт макета обязателен: черный фон, ровно ${frameCount} вертикальных карточек-кадров в один горизонтальный ряд, тонкие белые разделители, без второго ряда и без таблиц.`,
    "Каждая карточка состоит из большого визуального кадра сверху и небольшой черной зоны подсказок снизу.",
    `В левом верхнем углу каждой карточки нарисуй белый круг с номером кадра: ${frameNumbers}.`,
    "Внутри визуального кадра крупно напиши только реплику этого кадра на русском языке. Реплика должна совпадать дословно с полем РЕПЛИКА кадра.",
    "Реплика на кадре должна быть читаемой, белой, UGC-стиля, без рекламного дизайна и без дополнительных фраз.",
    "В нижней черной зоне каждой карточки добавь только маленькие серые подсказки для модели: РАКУРС: ...; ДЕЙСТВИЕ: ... .",
    "Не рисуй отдельные служебные блоки, верхние панели, нижние правила, карточки-инструкции или повторные thumbnails.",
    "Не добавляй UI соцсетей, кнопки приложения, водяные знаки, стрелки, стикеры или рекламные декоративные эффекты.",
    "Лицо героя должно выглядеть натурально: живое выражение, реальные поры, естественная текстура кожи, мягкий бытовой свет, без пластикового лица, beauty filter и лишнего сглаживания.",
    "Используй входные изображения как реальные визуальные референсы, а не как текстовые ссылки.",
    "Изображение 1 - наш аватар: лицо, возраст, телосложение, волосы и общий типаж героя.",
    productReferenceUrls.length
      ? `Изображения ${productRange} - реальный продукт: форма, цвет, упаковка, материал и размер.`
      : "Это talking-head сегмент: руки героя свободны, фокус на лице, жестах и атмосфере.",
    directorReferenceImageUrls.length
      ? `Изображения ${directorRange} - ровно ${directorReferenceImageUrls.length} исходных кадров именно речевого интервала сегмента ${input.segmentIndex}, а не всего оригинального reference-видео. Они синхронизированы с текущей репликой и показывают ее действия, атмосферу, одежду, предметы, камеру и ритм. Сопоставляй их только с панелями и репликой этого сегмента, сохраняй их последовательность и не переноси визуальные детали из других речевых интервалов; лицо оригинального автора не копируй.`
      : "",
    previousStoryboardReferenceUrl
      ? `Изображение ${previousReferenceIndex} - предыдущая раскадровка этого же ролика. Используй ее как continuity reference: тот же стиль, персонаж, одежда, свет, окружение, масштаб продукта и тот же макет. Не копируй старые действия. Ее outfit является каноничным для всего ролика: если текущие director reference кадры показывают другую одежду, игнорируй их и копируй точный outfit из предыдущей раскадровки.`
      : "",
    "Каждый кадр должен быть отдельной вертикальной визуальной панелью с таймингом две секунды.",
    "Раскадровка описывает только то, что физически видно в сцене: композицию, ракурс, окружение и действие.",
    "Avatar reference отвечает только за идентичность и пол героя: лицо, возраст, телосложение, волосы и общий типаж. Не бери из avatar reference одежду, атмосферу, предметы, камеру или действия.",
    "Главный герой в каждом кадре должен быть тем же человеком, что и на изображении один. Не меняй лицо, возраст, телосложение, волосы и общий типаж между кадрами.",
    "Детали героя фиксированы во всех кадрах: та же длина волос, пробор, объем прически, линия роста волос, украшения, вырез и рукава.",
    "Канонический outfit задается первым кадром первой части и затем повторяется без изменений во всех частях. Не заменяй футболку на свитер, рубашку, пиджак или другой верх; не меняй цвет, ткань, рукава, вырез, посадку и аксессуары.",
    "Материал одежды фиксируется первым кадром первой части. Во всех следующих кадрах и частях воспроизводи точно то же волокно, плетение, плотность, фактуру поверхности, швы, крой и посадку.",
    "Точный оттенок одежды фиксируется первым кадром первой части: копируй тот же hue, wash, контраст, масштаб рисунка и распределение цвета; светлый деним остается тем же светлым денимом и не становится темным.",
    "Одежда, стиль, свет и окружение должны строго следовать полям одежда, окружение и камера в каждом кадре. Если там есть REFERENCE LOCK, он важнее общих UGC-догадок.",
    "Одежда, стиль, свет и окружение должны оставаться одинаковыми во всех кадрах и между частями ролика. Не меняй цвет, тип одежды, посадку, аксессуары или прическу.",
    "Во всех talking-head кадрах герой смотрит прямо в объектив, даже если камера выше, ниже, сбоку или движется.",
    "Смысл текущей реплики и соответствующий reference-кадр определяют содержание панели. Переноси из reference только уместный визуальный приём: жест, реакцию, деталь рук, предмет окружения, действие, фактическую смену крупности или атмосферу. Сохраняй последовательность исходных кадров: если соседние reference-кадры сняты одинаково, оставляй тот же ракурс, фон и направление камеры; меняй крупность, угол или движение только там, где это видно в соответствующем reference-кадре. Не создавай пустую панель одного помещения: если reference не даёт отдельного действия, оставь героя в кадре.",
    "На каждой границе соседних reference-кадров отдельно проверь монтажный переход. Если виден пленочный засвет, light leak, короткая экспозиционная вспышка или lens flare, укажи именно этот эффект в нижней подсказке кадра; это краткий эффект склейки, а не движение камеры, скачок фона или смена одежды.",
    "Удержание внимания строится на естественной речи, жестах и действиях из оригинала. Не добавляй универсальные selfie-ракурсы, чередование лево-право, резкие наклоны, автоматические приближения или новые переходы. Если в оригинале нет явного визуального перехода, используй непрерывный естественный talking-head ракурс с тем же фоном.",
    productReferenceUrls.length
      ? `Если описание кадра говорит, что продукт виден, прорисуй именно продукт из входных изображений продукта, четко и детально. Товар разрешен только в панелях ${productFrameNumbers.length ? productFrameNumbers.join(", ") : "не указан ни в одной"}; во всех остальных панелях товара быть не должно, даже если он попал в исходные кадры.`
      : "Этот сегмент чередует talking-head героя с тематическими объектами и окружением текущих реплик; руки героя свободны.",
    productReferenceUrls.length
      ? "Если продукт назван обязательным коротким действием, покажи его один раз естественно в руке на уровне груди: упаковка должна быть узнаваемой и лицевой стороной к камере, без гигантского рекламного close-up. Не прячь и не уменьшай его до случайной детали."
      : "",
    !productReferenceUrls.length
      ? "Product reference намеренно отсутствует: продукт не показывай и не придумывай ни в одной панели этого сегмента, особенно в первом сегменте со скрытым product placement."
      : "",
    productPhysicalHint || "",
    "Не добавляй воду, стаканы, бутылки, шейкеры, напитки или растворение продукта, если это прямо не написано в кадре.",
    "Текст на картинке разрешен только как номер кадра, точная реплика кадра и нижние служебные подсказки. Не добавляй другие captions или рекламные надписи.",
    `Avatar reference URL: ${avatarReferenceUrl}.`,
    productReferenceUrls.length ? `Product reference URLs: ${productReferenceUrls.join(", ")}.` : "",
    directorReferenceImageUrls.length ? `Director reference image URLs: ${directorReferenceImageUrls.join(", ")}.` : "",
    previousStoryboardReferenceUrl ? `Previous storyboard reference URL: ${previousStoryboardReferenceUrl}.` : "",
    productReferenceUrls.length ? `Продукт: ${input.productName}.` : "",
    `Сегмент: ${input.segmentIndex}.`,
    ...input.storyboard.frames.map((frame, index) =>
      [
        `Кадр ${index + 1}, ${index * 2}-${(index + 1) * 2} сек:`,
        `РЕПЛИКА "${frame.spokenText}";`,
        `действие ${frame.visualAction};`,
        `камера ${frame.camera};`,
        `окружение ${frame.environment};`,
        `одежда ${frame.wardrobe};`,
        frame.effectNotes ? `переход ${frame.effectNotes};` : "",
        productReferenceUrls.length
          ? isProductVisibleInStoryboardFrame(frame as unknown as Record<string, unknown>, input.productName)
            ? `продукт ${frame.productPlacement};`
            : "продукт в этом кадре не показывай;"
          : `предметы ${frame.productPlacement};`,
        `звук ${frame.sfxNotes};`,
        "нижняя подсказка должна быть короткой: РАКУРС, ДЕЙСТВИЕ.",
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
