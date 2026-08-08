import type { OmniStoryboardSegment } from "@/lib/omni/storyboard/omni-storyboard-types";
import { isProductVisibleInStoryboardFrame } from "./omni-intro-product-contract";
import { renderProductPhysicalStoryboardHint } from "./product-physical-contract";
import { OMNI_PHYSICAL_ACTION_CONTRACT } from "./omni-physical-action-contract";
import { OMNI_REFERENCE_PRODUCT_EXCLUSION_PROMPT } from "./omni-scene-safety-contract";
import type { DirectorBrief } from "./director-analysis-types";
import { isCollagePictureInPictureReference } from "./director-layout-contract";
import type { ReferenceTransferPolicy } from "./omni-reference-transfer-policy";

export function buildStoryboardImagePrompt(input: {
  segmentIndex: number;
  storyboard: OmniStoryboardSegment;
  productName: string;
  productPhysicalContract?: string | null;
  avatarReferenceUrl: string | null;
  productReferenceUrls?: readonly string[];
  directorReferenceImageUrls?: readonly string[];
  previousStoryboardReferenceUrl?: string | null;
  directorBrief?: DirectorBrief | null;
  referencePolicy?: ReferenceTransferPolicy;
  repairInstructions?: readonly string[];
}) {
  const productReferenceUrls = uniqueUrls(input.productReferenceUrls || []);
  const directorReferenceImageUrls = uniqueUrls(input.directorReferenceImageUrls || []);
  const previousStoryboardReferenceUrl = cleanUrl(input.previousStoryboardReferenceUrl);
  const isPipLayout = isCollagePictureInPictureReference(input.directorBrief || null);
  const productFileStart = 2;
  const directorFileStart = productFileStart + productReferenceUrls.length;
  const previousFile = directorFileStart + directorReferenceImageUrls.length;
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
    "Не добавляй рекламный дизайн, UI, соцсети, водяные знаки, лишние captions, стикеры или декоративные эффекты. Разрешены только структурный номер, PIP или collage, если они прямо заданы reference-механикой или действием кадра.",
    "@file1 - avatar/character reference: только лицо, возраст, волосы, телосложение и личность героя. Лицо оригинального автора не копируй.",
    productReferenceUrls.length
      ? `@file${productFileStart}${productReferenceUrls.length > 1 ? `-@file${productFileStart + productReferenceUrls.length - 1}` : ""} - product reference images: точный продукт ${input.productName}, форма, цвет, упаковка, материал и размер.`
      : "Product reference не передан: продукт не показывай.",
    directorReferenceImageUrls.length
      ? input.referencePolicy?.mode === "style_only"
        ? `@file${directorFileStart}-@file${previousFile - 1} - кадры оригинала текущего сегмента: источник композиции главного presenter-кадра, ракурса, света, фона и цветового настроения. Не копируй действия, предметы, еду, упаковки, униформу или process B-roll; лицо только из @file1.`
        : `@file${directorFileStart}-@file${previousFile - 1} - кадры оригинала текущего сегмента: главный источник PIP, композиции, ракурса, света, фона, стиля одежды и монтажного ритма; порядок сохраняй, лицо только из @file1. Действия и предметы бери только из описания нужной панели ниже.`
      : "",
    previousStoryboardReferenceUrl
      ? `@file${previousFile} - только continuity героя, одежды, света и продукта; не источник композиции или действий.`
      : "",
    isPipLayout
      ? "REFERENCE LAYOUT: оригинал целиком в PIP/collage. В каждой панели полноэкранный динамичный фон и avatar cutout в нижнем левом углу с той же позицией, размером и белой обводкой; не делай centered talking-head."
      : "",
    "Сохрани одного героя, одну одежду, одинаковые волосы, свет и окружение во всех панелях. Лицо натуральное: поры, живая кожа, естественный бытовой свет, без пластикового сглаживания.",
    input.directorBrief?.clothing
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
    "Смысл реплики и действие нужной панели определяют кадр. Переноси из кадров оригинала композицию, ракурс, PIP, свет, фон, позу, переход и атмосферу, но не буквальные продукты, упаковки, коробки, еду, инструменты или реквизит. Сохраняй функцию вирусной механики, а не случайные предметы. Не заменяй PIP, numbered reveal или полноэкранную перебивку обычной talking-head съемкой.",
    OMNI_PHYSICAL_ACTION_CONTRACT,
    OMNI_REFERENCE_PRODUCT_EXCLUSION_PROMPT,
    "Канонический outfit задается первым кадром первой части: не меняй одежду, цвет, ткань, крой, аксессуары, волосы или прическу между панелями и частями.",
    productReferenceUrls.length
      ? `Продукт впервые появляется только в панели ${productRevealFrame || "по смыслу реплики"}; прорисуй его точно по product reference и сохраняй форму, упаковку и положение физически непрерывными.`
      : "",
    productReferenceUrls.length
      ? "Показывай продукт естественно, без рекламного close-up; не дублируй и не телепортируй его."
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
