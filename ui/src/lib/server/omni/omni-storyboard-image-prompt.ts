import type { OmniStoryboardSegment } from "@/lib/omni/storyboard/omni-storyboard-types";
import { isProductVisibleInStoryboardFrame } from "./omni-intro-product-contract";
import { renderProductPhysicalStoryboardHint } from "./product-physical-contract";
import { OMNI_PHYSICAL_ACTION_CONTRACT } from "./omni-physical-action-contract";

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
  const productReferenceUrls = uniqueUrls(input.productReferenceUrls || []);
  const directorReferenceImageUrls = uniqueUrls(input.directorReferenceImageUrls || []);
  const previousStoryboardReferenceUrl = cleanUrl(input.previousStoryboardReferenceUrl);
  const productPhysicalHint = productReferenceUrls.length
    ? renderProductPhysicalStoryboardHint(input.productPhysicalContract)
    : "";
  const frameCount = input.storyboard.frames.length;
  const productFrameNumbers = input.storyboard.frames
    .map((frame, index) => isProductVisibleInStoryboardFrame(frame as unknown as Record<string, unknown>, input.productName) ? index + 1 : null)
    .filter((index): index is number => index !== null);
  const productRevealFrame = productFrameNumbers[0] || null;
  return [
    `Создай одну широкую UGC-storyboard картинку: черный фон, ровно ${frameCount} вертикальных панелей в один ряд, белые разделители и номер панели в белом круге.`,
    "В каждой панели: сверху живой вертикальный кадр, внутри крупно точная реплика этого кадра на русском; снизу короткие серые подсказки РАКУРС и ДЕЙСТВИЕ.",
    "Не добавляй рекламный дизайн, UI, соцсети, водяные знаки, лишние captions, стикеры или декоративные эффекты.",
    "Изображение 1 - avatar/character reference: только лицо, возраст, волосы, телосложение и личность героя. Лицо оригинального автора не копируй.",
    productReferenceUrls.length
      ? `Следующие product reference images - точный продукт ${input.productName}: форма, цвет, упаковка, материал и размер.`
      : "Product reference не передан: продукт не показывай.",
    directorReferenceImageUrls.length
      ? "Director reference images - только ракурс, свет, фон, одежда, предметы, действие и монтажный ритм текущего сегмента; сохраняй их порядок, но лицо бери только из avatar reference."
      : "",
    previousStoryboardReferenceUrl
      ? "Предыдущая storyboard image - continuity reference: тот же герой, outfit, волосы, свет, фон, стиль и продукт; не копируй ее старые действия."
      : "",
    "Сохрани одного героя, одну одежду, одинаковые волосы, свет и окружение во всех панелях. Лицо натуральное: поры, живая кожа, естественный бытовой свет, без пластикового сглаживания.",
    "В talking-head кадрах герой смотрит прямо в объектив. Не добавляй selfie-ракурсы, которых нет в references.",
    "Смысл реплики определяет кадр. Переноси только видимые в references ракурс, действие, реакцию, жест, предмет, переход или атмосферу; не придумывай новые сцены.",
    OMNI_PHYSICAL_ACTION_CONTRACT,
    "Канонический outfit задается первым кадром первой части: не меняй одежду, цвет, ткань, крой, аксессуары, волосы или прическу между панелями и частями.",
    productReferenceUrls.length
      ? `Продукт впервые появляется только в панели ${productRevealFrame || "по смыслу реплики"}; прорисуй его точно по product reference и сохраняй форму, упаковку и положение физически непрерывными.`
      : "",
    productReferenceUrls.length
      ? "Показывай продукт естественно, без рекламного close-up; не дублируй и не телепортируй его."
      : "",
    productPhysicalHint ? compactText(productPhysicalHint, 180) : "",
    `Сегмент ${input.segmentIndex}. Каждый кадр длится две секунды.`,
    ...input.storyboard.frames.map((frame, index) =>
      [
        `Кадр ${index + 1}, ${index * 2}-${(index + 1) * 2} сек:`,
        `РЕПЛИКА "${frame.spokenText}".`,
        `действие: ${compactText(frame.visualAction)}; камера: ${compactText(frame.camera)}; окружение: ${compactText(frame.environment)}; одежда: ${compactText(frame.wardrobe)};`,
        frame.effectNotes ? `переход: ${compactText(frame.effectNotes)};` : "",
        productReferenceUrls.length
          ? isProductVisibleInStoryboardFrame(frame as unknown as Record<string, unknown>, input.productName)
            ? `продукт: ${compactText(frame.productPlacement, 150)};`
            : "продукт в этом кадре не показывай;"
          : `предметы: ${compactText(frame.productPlacement)};`,
        `звук: ${compactText(frame.sfxNotes)}.`,
      ].join(" ")
    ),
  ].filter(Boolean).join("\n");
}

function compactText(value: unknown, maxLength = 45) {
  const text = String(value || "").replace(/\s+/gu, " ").trim();
  if (text.length <= maxLength) return text;
  const clipped = text.slice(0, maxLength).replace(/\s+\S*$/u, "").trim();
  return clipped || text.slice(0, maxLength).trim();
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
