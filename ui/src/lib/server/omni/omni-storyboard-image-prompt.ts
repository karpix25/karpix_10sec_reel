import type { OmniStoryboardSegment } from "@/lib/omni/storyboard/omni-storyboard-types";
import { isProductVisibleInStoryboardFrame } from "./omni-intro-product-contract";
import { renderProductPhysicalStoryboardHint } from "./product-physical-contract";
import { OMNI_PHYSICAL_ACTION_CONTRACT } from "./omni-physical-action-contract";
import type { DirectorBrief } from "./director-analysis-types";
import { isCollagePictureInPictureReference } from "./director-layout-contract";

export function buildStoryboardImagePrompt(input: {
  segmentIndex: number;
  storyboard: OmniStoryboardSegment;
  productName: string;
  productPhysicalContract?: string | null;
  avatarReferenceUrl: string | null;
  productReferenceUrls?: readonly string[];
  directorReferenceImageUrls?: readonly string[];
  canonicalStoryboardReferenceUrl?: string | null;
  directorBrief?: DirectorBrief | null;
  repairInstructions?: readonly string[];
}) {
  const productReferenceUrls = uniqueUrls(input.productReferenceUrls || []);
  const directorReferenceImageUrls = uniqueUrls(input.directorReferenceImageUrls || []);
  const canonicalStoryboardReferenceUrl = cleanUrl(input.canonicalStoryboardReferenceUrl);
  const isPipLayout = isCollagePictureInPictureReference(input.directorBrief || null);
  const canonicalFile = canonicalStoryboardReferenceUrl ? 2 : null;
  const productFileStart = 2 + (canonicalFile ? 1 : 0);
  const directorFileStart = productFileStart + productReferenceUrls.length;
  const productPhysicalHint = productReferenceUrls.length
    ? renderProductPhysicalStoryboardHint(input.productPhysicalContract)
    : "";
  const frameCount = input.storyboard.frames.length;
  const productFrameNumbers = input.storyboard.frames
    .map((frame, index) => isProductVisibleInStoryboardFrame(frame as unknown as Record<string, unknown>, input.productName) ? index + 1 : null)
    .filter((index): index is number => index !== null);
  const productRevealFrame = productFrameNumbers[0] || null;
  return [
    `UGC-storyboard: черный фон, ровно ${frameCount} вертикальных панелей в ряд, белые разделители и номер панели.`,
    "В каждой панели: живой вертикальный кадр, точная реплика на русском, короткие подписи РАКУРС и ДЕЙСТВИЕ.",
    "Без рекламного дизайна, UI, соцсетей, водяных знаков, captions, стикеров и декора.",
    "@file1 - avatar/character reference: только лицо, возраст, волосы, телосложение и личность героя. Лицо оригинального автора не копируй.",
    canonicalFile
      ? `@file${canonicalFile} - эталон одежды из первого утверждённого storyboard. В точности повтори видимые верх, рукава, вырез, ткань, цвет, очки, украшения и волосы. Этот эталон важнее кадров оригинала для внешнего вида героя.`
      : "Первый storyboard задаёт эталон одежды для всех следующих частей ролика.",
    productReferenceUrls.length
      ? `@file${productFileStart}${productReferenceUrls.length > 1 ? `-@file${productFileStart + productReferenceUrls.length - 1}` : ""} - product reference images: точный продукт ${input.productName}, форма, цвет, упаковка, материал и размер.`
      : "Product reference не передан: продукт не показывай.",
    directorReferenceImageUrls.length
      ? canonicalFile
        ? `@file${directorFileStart}-@file${directorFileStart + directorReferenceImageUrls.length - 1} - кадры оригинала: источник только локации, ракурса, света, движения камеры, PIP и монтажа. Лицо только из @file1; одежду не копируй, она задана эталоном @file${canonicalFile}; не копируй исходный товар, текст, логотипы или предметы вне действия панели.`
        : `@file${directorFileStart}-@file${directorFileStart + directorReferenceImageUrls.length - 1} - кадры оригинала: источник только локации, ракурса, света, одежды, движения камеры, PIP и монтажа. Лицо только из @file1; не копируй исходный товар, текст, логотипы или предметы вне действия панели.`
      : "",
    isPipLayout
      ? "REFERENCE LAYOUT: оригинал целиком в PIP/collage. В каждой панели полноэкранный динамичный фон и avatar cutout в нижнем левом углу с той же позицией, размером и белой обводкой; не делай centered talking-head."
      : "",
    canonicalFile
      ? "OUTFIT LOCK: во всех панелях одежда должна совпадать с эталоном. Любое изменение типа верха, рукавов, выреза, ткани, цвета, очков, украшений или волос — ошибка."
      : "Сохрани одного героя, одну одежду, одинаковые волосы, свет и окружение. Натуральная живая кожа и бытовой свет, без пластика.",
    !canonicalFile && input.directorBrief?.clothing
      ? [
          "CLOTHING LOCK (all panels):",
          input.directorBrief.clothing.style,
          input.directorBrief.clothing.fit_details,
          input.directorBrief.clothing.color_palette.length
            ? `colors: ${input.directorBrief.clothing.color_palette.join(", ")}`
            : "",
          input.directorBrief.clothing.adaptation_notes || "",
        ].filter(Boolean).join("; ") + ". Same fabric, cut, and color in every panel — any deviation is a failure."
      : "",
    "В talking-head кадрах герой смотрит прямо в объектив. Не добавляй selfie-ракурсы, которых нет в references.",
    "Смысл реплики определяет главный предмет и действие кадра. Сохраняй мир съемки: ракурс, свет, одежду, тряску, PIP и монтаж; жест адаптируй. Исходный рекламный товар всегда заменяй нашим или убирай; нейтральный реквизит только поддерживает реплику.",
    OMNI_PHYSICAL_ACTION_CONTRACT,
    "Не меняй одежду, цвет, ткань, крой, аксессуары или волосы между панелями.",
    productReferenceUrls.length
      ? `Продукт впервые появляется только в панели ${productRevealFrame || "по смыслу реплики"}; точно по product reference, без смены формы, упаковки и положения.`
      : "",
    productReferenceUrls.length
      ? "Показывай продукт естественно, без рекламного close-up, дублей и телепортации."
      : "",
    productPhysicalHint ? compactText(productPhysicalHint, 180) : "",
    input.repairInstructions?.length
      ? `PHYSICAL REPAIR FROM PRIOR CHECK: ${input.repairInstructions.join("; ")}.`
      : "",
    `Сегмент ${input.segmentIndex}. Каждый кадр длится две секунды.`,
    ...input.storyboard.frames.map((frame, index) =>
      [
        `Кадр ${index + 1}, ${index * 2}-${(index + 1) * 2} сек:`,
        `РЕПЛИКА "${frame.spokenText}".`,
        `действие: ${compactText(frame.visualAction)}; камера: ${compactText(frame.camera)}; окружение: ${compactText(frame.environment)}; одежда: ${compactText(frame.wardrobe)};`,
        frame.effectNotes ? `переход: ${compactText(frame.effectNotes)};` : "",
        frame.referenceTransfer
          ? `перенос: исходный товар ${frame.referenceTransfer.decisions.sourceProduct}; нейтральный реквизит ${frame.referenceTransfer.decisions.sourceProps};`
          : "",
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
