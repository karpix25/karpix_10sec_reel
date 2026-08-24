import type { OmniStoryboardSegment } from "@/lib/omni/storyboard/omni-storyboard-types";
import { isProductVisibleInStoryboardFrame } from "./omni-intro-product-contract";
import { renderProductPhysicalStoryboardHint } from "./product-physical-contract";
import { OMNI_PHYSICAL_ACTION_CONTRACT } from "./omni-physical-action-contract";
import type { DirectorBrief } from "./director-analysis-types";
import { isCollagePictureInPictureReference } from "./director-layout-contract";
import { isAvatarFreeReferenceScene, isFacelessReferenceScene, isObjectOnlyReferenceScene, resolveReferenceSceneMode, type ReferenceSceneMode } from "./omni-reference-scene-mode";
import type { ProductRole } from "../../omni/creative-contract";
import type { DirectorWardrobeContinuity } from "./director-wardrobe";
import { isVoiceoverMontageReference, resolveReferenceFormatMode } from "./omni-reference-format-mode";
import { renderReferenceSegmentPlanForPrompt, type ReferenceSegmentPlan } from "./reference-segment-plan";

export function buildStoryboardImagePrompt(input: {
  segmentIndex: number;
  storyboard: OmniStoryboardSegment;
  productName: string;
  productPhysicalContract?: string | null;
  productRole?: ProductRole;
  avatarReferenceUrl: string | null;
  productReferenceUrls?: readonly string[];
  directorReferenceImageUrls?: readonly string[];
  canonicalStoryboardReferenceUrl?: string | null;
  previousStoryboardReferenceUrl?: string | null;
  directorBrief?: DirectorBrief | null;
  referenceSegmentPlan?: ReferenceSegmentPlan | null;
  referenceSceneMode?: ReferenceSceneMode;
  repairInstructions?: readonly string[];
}) {
  const referenceSceneMode = input.referenceSceneMode || resolveReferenceSceneMode(input.directorBrief);
  const montageReference = isVoiceoverMontageReference(resolveReferenceFormatMode(input.directorBrief));
  const wardrobeContinuity = input.directorBrief
    ? input.directorBrief.wardrobe_continuity || "unknown"
    : "stable";
  const facelessReferenceScene = isFacelessReferenceScene(referenceSceneMode);
  const avatarFreeReferenceScene = isAvatarFreeReferenceScene(referenceSceneMode);
  const voiceoverBrollReference = referenceSceneMode === "voiceover_broll";
  const deliveryModes = new Set(input.storyboard.frames
    .map((frame) => frame.speechMode || frame.physicalPlan?.speechMode)
    .filter((mode): mode is "on_camera" | "voiceover_only" => mode === "on_camera" || mode === "voiceover_only"));
  const hybridDelivery = deliveryModes.has("on_camera") && deliveryModes.has("voiceover_only");
  const objectOnlyReferenceScene = isObjectOnlyReferenceScene(referenceSceneMode);
  const productReferenceUrls = uniqueUrls(input.productReferenceUrls || []);
  const directorReferenceImageUrls = uniqueUrls(input.directorReferenceImageUrls || []);
  const canonicalStoryboardReferenceUrl = cleanUrl(input.canonicalStoryboardReferenceUrl);
  const previousStoryboardReferenceUrl = cleanUrl(input.previousStoryboardReferenceUrl);
  const isPipLayout = isCollagePictureInPictureReference(input.directorBrief || null);
  const avatarFile = avatarFreeReferenceScene ? null : 1;
  const firstReferenceFile = avatarFile ? 2 : 1;
  const canonicalFile = canonicalStoryboardReferenceUrl ? firstReferenceFile : null;
  const repairFile = previousStoryboardReferenceUrl
    ? firstReferenceFile + (canonicalFile ? 1 : 0)
    : null;
  const productFileStart = firstReferenceFile + (canonicalFile ? 1 : 0) + (repairFile ? 1 : 0);
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
    `UGC-storyboard: черный фон, ровно ${frameCount} вертикальных панелей в ряд и белые разделители.`,
    renderReferenceSegmentPlanForPrompt(input.referenceSegmentPlan),
    "В панелях только живые вертикальные кадры без букв, цифр, реплик, заголовков и технических подписей.",
    "Без рекламного дизайна, элементов соцсетей, водяных знаков, captions, стикеров и декора; экран продукта допустим только по product reference.",
    objectOnlyReferenceScene
      ? "OBJECT-ONLY CONTRACT: в кадре нет человека, рук, лица, головы, глаз, губ, портрета аватара или talking-head. Показывай только утверждённую поверхность, предметы и концептуальные пропы. Озвучка идёт за кадром. Не добавляй человека из avatar reference."
      : facelessReferenceScene
        ? "FACELESS HANDS-ONLY CONTRACT: в кадре нет лица, головы, глаз, губ, портрета аватара или talking-head. Показывай только руки, допустимый фрагмент корпуса и предметы, которые нужны действию. Озвучка идёт за кадром. Не добавляй человека из avatar reference."
      : voiceoverBrollReference
        ? "VOICEOVER B-ROLL CONTRACT: голос идёт за кадром поверх независимых cutaways. Сохранённый avatar/character reference остаётся визуальным героем во всех панелях; он не говорит, не синхронизирует губы и не превращается в talking-head. Случайные люди не заменяют его."
      : hybridDelivery
        ? "HYBRID DELIVERY CONTRACT: в каждой панели следуй speech_mode раскадровки. on_camera — аватар говорит в кадре; voiceover_only — аватар молчит, а реплика звучит за кадром поверх самостоятельного B-roll. Не смешивай эти режимы и не добавляй lip-sync в voiceover_only."
      : "@file1 - avatar/character reference: единственный человек во всех панелях; фиксирует лицо, пол, возраст, волосы, телосложение и личность. Не копируй их из кадров reference.",
    canonicalFile
      ? objectOnlyReferenceScene
        ? `@file${canonicalFile} - эталон композиции, поверхности и реквизита из первого утверждённого storyboard. Сохрани макро поверхность, ракурс, свет и физическое положение предметов; не добавляй человека, руки, лицо или голову.`
        : facelessReferenceScene
          ? `@file${canonicalFile} - эталон композиции и реквизита из первого утверждённого storyboard. Сохрани поверхность, ракурс, свет, руки и физическое положение предметов; не добавляй лицо или голову.`
        : voiceoverBrollReference
          ? `@file${canonicalFile} - эталон монтажной композиции и B-roll ритма из первого утверждённого storyboard; лицо и личность всё равно бери из avatar reference @file1.`
        : wardrobeContinuity === "stable"
          ? `@file${canonicalFile} - эталон одежды из первого утверждённого storyboard. В точности повтори видимые верх, рукава, вырез, ткань, цвет, очки, украшения и волосы. Этот эталон важнее кадров оригинала для внешнего вида героя.`
          : `@file${canonicalFile} - эталон личности и базовой композиции из первого утверждённого storyboard. Не используй его как глобальный эталон одежды: одежда определяется анализом текущего reference-интервала и соответствующей раскадровкой.`
      : objectOnlyReferenceScene
        ? "Первый storyboard задаёт эталон макро поверхности, света, композиции и реквизита для всех следующих частей; человека и руки не добавляй."
        : facelessReferenceScene
          ? "Первый storyboard задаёт эталон композиции, рук и реквизита для всех следующих частей ролика."
        : voiceoverBrollReference
          ? "Первый storyboard задаёт монтажный ритм и визуальную механику B-roll; avatar reference @file1 фиксирует повторяющегося визуального героя."
        : wardrobeContinuity === "stable"
          ? "Первый storyboard задаёт эталон одежды для всех следующих частей ролика."
          : wardrobeContinuity === "not_visible"
            ? "Одежда не видна в анализируемом reference-интервале; не выдумывай детали одежды и не создавай глобальный outfit lock."
            : "Одежда каждой панели берётся из соответствующего анализируемого reference-интервала и поля wardrobe её раскадровки; не переноси одежду из первого storyboard в другие cut.",
    repairFile
      ? `@file${repairFile} - предыдущая версия этой раскадровки. Это база для точечной правки: сохрани без изменений все панели, которые не названы в PHYSICAL REPAIR FROM PRIOR CHECK. Меняй только указанные панели и детали; не создавай новый вариант всего storyboard.`
      : "",
    productReferenceUrls.length
      ? `@file${productFileStart}${productReferenceUrls.length > 1 ? `-@file${productFileStart + productReferenceUrls.length - 1}` : ""} - product reference images: точный продукт ${input.productName}, его утвержденный экран смартфона и видимые детали; не превращай цифровой продукт в физическую карту или упаковку.`
      : "Product reference не передан: продукт не показывай.",
    directorReferenceImageUrls.length
      ? voiceoverBrollReference
        ? `@file${directorFileStart}-@file${directorFileStart + directorReferenceImageUrls.length - 1} - кадры оригинала: источник независимых B-roll локаций, ракурсов, света, движения камеры и монтажа из плана панели. Не копируй главного персонажа, исходный рекламный товар, текст или логотипы.`
      : canonicalFile
        ? objectOnlyReferenceScene
          ? `@file${directorFileStart}-@file${directorFileStart + directorReferenceImageUrls.length - 1} - кадры оригинала: источник только макро поверхности, ракурса, света, движения камеры, монтажа и концептуальных пропов из плана панели. Человека, руки, лицо, голову, исходный рекламный товар, текст и логотипы не копируй.`
          : facelessReferenceScene
            ? `@file${directorFileStart}-@file${directorFileStart + directorReferenceImageUrls.length - 1} - кадры оригинала: источник только локации, ракурса, света, движения камеры, PIP, монтажа, рук и обязательного нейтрального реквизита из плана панели. Лицо, голову и исходный рекламный товар не копируй; не копируй текст или логотипы.`
          : `@file${directorFileStart}-@file${directorFileStart + directorReferenceImageUrls.length - 1} - кадры оригинала: источник локации, ракурса, света, одежды, движения камеры, PIP, монтажа и обязательного нейтрального реквизита из плана панели. Лицо только из @file1; ${renderReferenceImageWardrobeRule(wardrobeContinuity, canonicalFile ? `эталон @file${canonicalFile}` : "текущий reference-интервал")}; не копируй исходный рекламный товар, текст или логотипы.`
        : objectOnlyReferenceScene
          ? `@file${directorFileStart}-@file${directorFileStart + directorReferenceImageUrls.length - 1} - кадры оригинала: источник только макро поверхности, ракурса, света, движения камеры, монтажа и концептуальных пропов из плана панели. Человека, руки, лицо, голову, исходный рекламный товар, текст и логотипы не копируй.`
          : facelessReferenceScene
            ? `@file${directorFileStart}-@file${directorFileStart + directorReferenceImageUrls.length - 1} - кадры оригинала: источник только локации, ракурса, света, рук, движения камеры, PIP, монтажа и обязательного нейтрального реквизита из плана панели. Лицо, голову и исходный рекламный товар не копируй; не копируй текст или логотипы.`
          : voiceoverBrollReference
            ? `@file${directorFileStart}-@file${directorFileStart + directorReferenceImageUrls.length - 1} - кадры оригинала: источник независимых B-roll локаций, ракурсов, света, движения камеры и монтажа из плана панели. Лицо и личность бери из avatar reference @file1; не копируй исходных людей, рекламный товар, текст или логотипы.`
          : `@file${directorFileStart}-@file${directorFileStart + directorReferenceImageUrls.length - 1} - кадры оригинала: источник локации, ракурса, света, одежды, движения камеры, PIP, монтажа и обязательного нейтрального реквизита из плана панели. Лицо только из @file1; не копируй исходный рекламный товар, текст или логотипы.`
      : "",
    !avatarFreeReferenceScene && !objectOnlyReferenceScene && !facelessReferenceScene
      ? montageReference || voiceoverBrollReference
        ? "PERSON REPLACEMENT LOCK: любые люди, лица, волосы, тела и кожа в director reference — только визуальные заглушки для композиции и действия. Полностью замени их на одного сохранённого аватара из @file1; не копируй исходных мужчин, женщин или случайных людей. Сохраняй только локацию, позу, ракурс и движение."
        : "PERSON REPLACEMENT LOCK: лицо, волосы, тело и кожа героя берутся только из @file1. Люди из director reference — только заглушки композиции; не копируй их внешность."
      : "",
    isPipLayout && !avatarFreeReferenceScene
      ? "REFERENCE LAYOUT: оригинал целиком в PIP/collage. В каждой панели полноэкранный динамичный фон и avatar cutout в нижнем левом углу с той же позицией, размером и белой обводкой; не делай centered talking-head."
      : "",
    objectOnlyReferenceScene
      ? "SCENE CONTINUITY LOCK: во всех панелях сохраняй одну и ту же макро поверхность, ракурс, свет и физическое положение реквизита. Не создавай человека, руки, лицо или голову между панелями."
      : facelessReferenceScene
        ? "SCENE CONTINUITY LOCK: во всех панелях сохраняй одну и ту же поверхность, ракурс, свет, руки и физическое положение реквизита. Не создавай лицо или голову между панелями."
      : voiceoverBrollReference
        ? "SCENE CONTINUITY LOCK: сохраняй независимость B-roll панелей и соответствующие reference-локации, но фиксируй одного и того же аватара из @file1 как визуального героя; он молчит и не смотрит в объектив обязательно."
      : "",
    !avatarFreeReferenceScene && !objectOnlyReferenceScene && !facelessReferenceScene
      ? renderStoryboardImageWardrobeContract({ wardrobeContinuity, hasCanonicalReference: Boolean(canonicalFile) })
      : "",
    !avatarFreeReferenceScene && wardrobeContinuity === "stable" && !canonicalFile && input.directorBrief?.clothing
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
    facelessReferenceScene
      ? "В кадре нет talking-head и взгляда в объектив: действие выполняют руки, а голос остаётся за кадром."
      : voiceoverBrollReference
        ? "В кадре нет talking-head и lip-sync; сохранённый аватар действует молча, голос остаётся за кадром, а независимые B-roll сцены следуют соответствующим reference-кадрам."
      : hybridDelivery
        ? "HYBRID AUDIO: speech_mode=on_camera означает речь аватара в кадре; speech_mode=voiceover_only означает молчащий визуальный B-roll и закадровую реплику."
      : montageReference
        ? "VOICEOVER MONTAGE: голос идёт за кадром или поверх независимых кадров; не добавляй обязательный talking-head взгляд в объектив, если его нет в соответствующем reference-кадре."
        : "В talking-head кадрах герой смотрит прямо в объектив. Не добавляй selfie-ракурсы, которых нет в references.",
    `Смысл реплики определяет главный предмет и действие кадра. Сохраняй ракурс, свет, ${renderReferenceImageWardrobeRule(wardrobeContinuity, "текущий анализируемый reference-интервал")}, тряску, PIP и монтаж reference; жест адаптируй. Исходный рекламный товар и его упаковка никогда не являются нейтральным реквизитом: при replace_with_product показывай только продукт клиента, при remove не показывай. Остальной реквизит — только из плана.`,
    productAppearsInThisSegment && input.productRole !== "digital_demo" ? OMNI_PHYSICAL_ACTION_CONTRACT : "",
    productAppearsInThisSegment
      ? `Продукт впервые появляется только в панели ${productRevealFrame || "по смыслу реплики"}; точно по product reference, без смены формы, упаковки и положения.`
      : "",
    productAppearsInThisSegment
      ? "Показывай продукт естественно, без рекламного close-up, дублей и телепортации."
      : "",
    productPhysicalHint && input.productRole !== "digital_demo" ? compactText(productPhysicalHint, 180) : "",
    productAppearsInThisSegment && input.productRole === "digital_demo"
      ? "DIGITAL PRODUCT: показывай только утвержденный экран продукта на смартфоне; не изображай пластиковую карту, упаковку или физический товар."
      : "",
    input.repairInstructions?.length
      ? `PHYSICAL REPAIR FROM PRIOR CHECK: ${input.repairInstructions.join("; ")}.`
      : "",
    `Сегмент ${input.segmentIndex}. Каждый кадр длится две секунды.`,
    ...input.storyboard.frames.map((frame, index) =>
      [
        `Кадр ${index + 1}, ${index * 2}-${(index + 1) * 2} сек:`,
        `смысл речи для визуального действия: ${frame.spokenText}.`,
        frame.speechMode ? `speech_mode: ${frame.speechMode};` : "",
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

function renderReferenceImageWardrobeRule(continuity: DirectorWardrobeContinuity, source: string) {
  if (continuity === "stable") return `одежду из ${source} не копируй: она задана утверждённой раскадровкой`;
  if (continuity === "changes_between_cuts") return `одежда только из ${source}; не переноси её в другие cut`;
  if (continuity === "not_visible") return "одежду не выдумывай: она не подтверждена анализом";
  return "одежда только текущего reference-интервала; глобальный outfit lock запрещён";
}

function renderStoryboardImageWardrobeContract(input: {
  wardrobeContinuity: DirectorWardrobeContinuity;
  hasCanonicalReference: boolean;
}) {
  if (input.wardrobeContinuity === "stable") {
    return input.hasCanonicalReference
      ? "OUTFIT LOCK: повторяй outfit утверждённой раскадровки во всех панелях; тип верха, рукава, вырез, ткань, цвет и волосы не меняй."
      : "OUTFIT LOCK: одна одежда, одинаковые волосы, свет и окружение во всех панелях; натуральная живая кожа.";
  }
  if (input.wardrobeContinuity === "not_visible") {
    return "WARDROBE POLICY: одежда не видна; не выдумывай и не проверяй её детали.";
  }
  return input.wardrobeContinuity === "changes_between_cuts"
    ? "WARDROBE BY SOURCE INTERVAL: одежда текущего storyboard кадра; смена только между интервалами из wardrobe_timeline."
    : "WARDROBE BY ANALYZED PLAN: следуй текущему storyboard кадру; формат reference не задаёт continuity.";
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
