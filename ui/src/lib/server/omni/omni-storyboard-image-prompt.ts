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
  previousStoryboardReferenceUrl?: string | null;
  directorBrief?: DirectorBrief | null;
  repairInstructions?: readonly string[];
}) {
  const productReferenceUrls = uniqueUrls(input.productReferenceUrls || []);
  const directorReferenceImageUrls = uniqueUrls(input.directorReferenceImageUrls || []);
  const canonicalStoryboardReferenceUrl = cleanUrl(input.canonicalStoryboardReferenceUrl);
  const previousStoryboardReferenceUrl = cleanUrl(input.previousStoryboardReferenceUrl);
  const isPipLayout = isCollagePictureInPictureReference(input.directorBrief || null);
  const canonicalFile = canonicalStoryboardReferenceUrl ? 2 : null;
  const repairFile = previousStoryboardReferenceUrl ? 2 + (canonicalFile ? 1 : 0) : null;
  const productFileStart = 2 + (canonicalFile ? 1 : 0) + (repairFile ? 1 : 0);
  const directorFileStart = productFileStart + productReferenceUrls.length;
  const frameCount = input.storyboard.frames.length;
  const productFrameNumbers = input.storyboard.frames
    .map((frame, index) => isProductVisibleInStoryboardFrame(frame as unknown as Record<string, unknown>, input.productName) ? index + 1 : null)
    .filter((index): index is number => index !== null);
  const productRevealFrame = productFrameNumbers[0] || null;
  const productAppearsInThisSegment = productFrameNumbers.length > 0;
  const productPhysicalHint = productAppearsInThisSegment
    ? renderProductPhysicalStoryboardHint(input.productPhysicalContract)
    : "";
  return [
    `UGC-storyboard: черный фон, ровно ${frameCount} вертикальных панелей в ряд, белые разделители и номер панели.`,
    "В каждой панели: живой вертикальный кадр, точная реплика на русском, короткие подписи РАКУРС и ДЕЙСТВИЕ.",
    "Без рекламного дизайна, UI, соцсетей, водяных знаков, captions, стикеров и декора.",
    "@file1 - avatar/character reference: единственный человек во всех панелях; фиксирует лицо, пол, возраст, волосы, телосложение и личность. Не копируй их из кадров reference.",
    canonicalFile
      ? `@file${canonicalFile} - эталон одежды из первого утверждённого storyboard. В точности повтори видимые верх, рукава, вырез, ткань, цвет, очки, украшения и волосы. Этот эталон важнее кадров оригинала для внешнего вида героя.`
      : "Первый storyboard задаёт эталон одежды для всех следующих частей ролика.",
    repairFile
      ? `@file${repairFile} - предыдущая версия этой раскадровки. Это база для точечной правки: сохрани без изменений все панели, которые не названы в PHYSICAL REPAIR FROM PRIOR CHECK. Меняй только указанные панели и детали; не создавай новый вариант всего storyboard.`
      : "",
    productReferenceUrls.length
      ? `@file${productFileStart}${productReferenceUrls.length > 1 ? `-@file${productFileStart + productReferenceUrls.length - 1}` : ""} - product reference images: точный продукт ${input.productName}, форма, цвет, упаковка, материал и размер.`
      : "Product reference не передан: продукт не показывай.",
    directorReferenceImageUrls.length
      ? canonicalFile
        ? `@file${directorFileStart}-@file${directorFileStart + directorReferenceImageUrls.length - 1} - кадры оригинала: источник только локации, ракурса, света, движения камеры, PIP, монтажа и обязательного нейтрального реквизита из плана панели. Лицо только из @file1; одежду не копируй, она задана эталоном @file${canonicalFile}; не копируй исходный рекламный товар, текст или логотипы.`
        : `@file${directorFileStart}-@file${directorFileStart + directorReferenceImageUrls.length - 1} - кадры оригинала: источник только локации, ракурса, света, одежды, движения камеры, PIP, монтажа и обязательного нейтрального реквизита из плана панели. Лицо только из @file1; не копируй исходный рекламный товар, текст или логотипы.`
      : "",
    isPipLayout
      ? "REFERENCE LAYOUT: оригинал целиком в PIP/collage. В каждой панели полноэкранный динамичный фон и avatar cutout в нижнем левом углу с той же позицией, размером и белой обводкой; не делай centered talking-head."
      : "",
    canonicalFile
      ? "OUTFIT LOCK: во всех панелях одежда должна совпадать с эталоном. Любое изменение типа верха, рукавов, выреза, ткани, цвета, очков, украшений или волос — ошибка."
      : "OUTFIT LOCK: сохрани одного героя, одну одежду, одинаковые волосы, свет и окружение. Натуральная живая кожа и бытовой свет, без пластика.",
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
    "Смысл реплики определяет главный предмет и действие кадра. Сохраняй ракурс, свет, одежду, тряску, PIP и монтаж reference; жест адаптируй. Исходный рекламный товар и его упаковка никогда не являются нейтральным реквизитом: при replace_with_product показывай только продукт клиента, при remove не показывай. Остальной реквизит — только из плана.",
    productAppearsInThisSegment ? OMNI_PHYSICAL_ACTION_CONTRACT : "",
    productAppearsInThisSegment
      ? `Продукт впервые появляется только в панели ${productRevealFrame || "по смыслу реплики"}; точно по product reference, без смены формы, упаковки и положения.`
      : "",
    productAppearsInThisSegment
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
        `действие: ${compactText(frame.visualAction)}; камера: ${compactText(frame.camera)};${index === 0 ? ` окружение: ${compactText(frame.environment)}; одежда: ${compactText(frame.wardrobe)};` : ""}`,
        frame.effectNotes ? `переход: ${compactText(frame.effectNotes)};` : "",
        frame.referenceTransfer
          ? `перенос: исходный рекламный товар ${frame.referenceTransfer.decisions.sourceProduct}; его упаковку и части не сохраняй; нейтральный реквизит ${frame.referenceTransfer.decisions.sourceProps}; композиция ${compactText(frame.referenceTransfer.cameraComposition || "сохраняй reference")}; обязательный реквизит ${(frame.referenceTransfer.requiredSupportProps || []).join("; ") || "нет"}; обязательное действие ${compactText(frame.referenceTransfer.requiredReferenceAction || "нет")};`
          : "",
        productReferenceUrls.length
          ? isProductVisibleInStoryboardFrame(frame as unknown as Record<string, unknown>, input.productName)
            ? `продукт: ${index === 0 ? compactText(frame.productPlacement, 70) : "по действию кадра, без телепортации"};`
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
