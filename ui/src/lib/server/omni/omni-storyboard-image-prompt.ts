import type { OmniStoryboardSegment } from "@/lib/omni/storyboard/omni-storyboard-types";
import { isProductVisibleInStoryboardFrame } from "./omni-intro-product-contract";
import { renderProductPhysicalStoryboardHint } from "./product-physical-contract";
import { OMNI_PHYSICAL_ACTION_CONTRACT } from "./omni-physical-action-contract";
import type { DirectorBrief } from "./director-analysis-types";
import { isCollagePictureInPictureReference } from "./director-layout-contract";
import { isAvatarFreeReferenceScene, isFacelessReferenceScene, isObjectOnlyReferenceScene, resolveReferenceSceneMode, type ReferenceSceneMode } from "./omni-reference-scene-mode";
import type { ProductRole } from "../../omni/creative-contract";
import { requiresContinuousPresenterWardrobe } from "./director-wardrobe";
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
  const referenceFormatMode = resolveReferenceFormatMode(input.directorBrief);
  const montageReference = isVoiceoverMontageReference(referenceFormatMode);
  const continuousPresenterWardrobe = requiresContinuousPresenterWardrobe({ referenceFormatMode, referenceSceneMode });
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
        ? "DIRECTOR-LED B-ROLL: создавай самостоятельные сцены под смысл реплики. Любой главный человек использует avatar reference; фоновые люди и видимая речь допустимы."
      : hybridDelivery
        ? "DIRECTOR-LED HYBRID: речь в кадре или за кадром выбирай по смыслу новой сцены. Любой главный человек использует avatar reference; фоновые люди допустимы."
      : "@file1 - avatar/character reference: источник личности главного героя. Фоновые люди допустимы и не обязаны повторять аватара.",
    canonicalFile
      ? objectOnlyReferenceScene
        ? `@file${canonicalFile} - эталон композиции, поверхности и реквизита из первого утверждённого storyboard. Сохрани макро поверхность, ракурс, свет и физическое положение предметов; не добавляй человека, руки, лицо или голову.`
        : facelessReferenceScene
          ? `@file${canonicalFile} - эталон композиции и реквизита из первого утверждённого storyboard. Сохрани поверхность, ракурс, свет, руки и физическое положение предметов; не добавляй лицо или голову.`
        : voiceoverBrollReference
          ? `@file${canonicalFile} - эталон монтажной композиции и B-roll ритма из первого утверждённого storyboard; лицо и личность всё равно бери из avatar reference @file1.`
        : continuousPresenterWardrobe
          ? `@file${canonicalFile} - эталон точной одежды главного аватара из первого утверждённого storyboard. Сохрани тот же тип одежды, длину рукавов, вырез, цвет, материал и видимые аксессуары; камеру, локацию и композицию ставь заново.`
          : `@file${canonicalFile} - предыдущий визуальный контекст и идентичность главного аватара. Это не точный lock одежды, камеры, локации или композиции.`
      : objectOnlyReferenceScene
        ? "Первый storyboard задаёт эталон макро поверхности, света, композиции и реквизита для всех следующих частей; человека и руки не добавляй."
        : facelessReferenceScene
          ? "Первый storyboard задаёт эталон композиции, рук и реквизита для всех следующих частей ролика."
        : voiceoverBrollReference
          ? "Первый storyboard задаёт монтажный ритм и визуальную механику B-roll; avatar reference @file1 фиксирует повторяющегося визуального героя."
        : continuousPresenterWardrobe
          ? "Первый storyboard выбирает один точный outfit главного аватара для всего ролика. Во всех следующих частях одежда остаётся той же; камера, локация и композиция могут меняться по новой режиссуре."
          : "Первый storyboard задаёт только идентичность главного аватара и общий визуальный контекст; точная одежда, камера и локация могут меняться по новой режиссуре.",
    repairFile
      ? `@file${repairFile} - предыдущая версия этой раскадровки. Это база для точечной правки: сохрани без изменений все панели, которые не названы в PHYSICAL REPAIR FROM PRIOR CHECK. Меняй только указанные панели и детали; не создавай новый вариант всего storyboard.`
      : "",
    productReferenceUrls.length
      ? `@file${productFileStart}${productReferenceUrls.length > 1 ? `-@file${productFileStart + productReferenceUrls.length - 1}` : ""} - product reference images: точный продукт ${input.productName}, его утвержденный экран смартфона и видимые детали; не превращай цифровой продукт в физическую карту или упаковку.`
      : "Product reference не передан: продукт не показывай.",
    directorReferenceImageUrls.length
      ? voiceoverBrollReference
        ? `@file${directorFileStart}-@file${directorFileStart + directorReferenceImageUrls.length - 1} - кадры оригинала: только вдохновение для макроформата, света и энергии. Не копируй точные сцены, людей, одежду, действия, товар, текст или логотипы.`
      : canonicalFile
        ? objectOnlyReferenceScene
          ? `@file${directorFileStart}-@file${directorFileStart + directorReferenceImageUrls.length - 1} - кадры оригинала: источник только макро поверхности, ракурса, света, движения камеры, монтажа и концептуальных пропов из плана панели. Человека, руки, лицо, голову, исходный рекламный товар, текст и логотипы не копируй.`
          : facelessReferenceScene
            ? `@file${directorFileStart}-@file${directorFileStart + directorReferenceImageUrls.length - 1} - кадры оригинала: источник только локации, ракурса, света, движения камеры, PIP, монтажа, рук и обязательного нейтрального реквизита из плана панели. Лицо, голову и исходный рекламный товар не копируй; не копируй текст или логотипы.`
          : `@file${directorFileStart}-@file${directorFileStart + directorReferenceImageUrls.length - 1} - кадры оригинала: вдохновение для макроформата, света и энергии. Сцену, одежду, камеру и действие поставь заново; лицо главного героя только из @file1; не копируй товар, текст или логотипы.`
        : objectOnlyReferenceScene
          ? `@file${directorFileStart}-@file${directorFileStart + directorReferenceImageUrls.length - 1} - кадры оригинала: источник только макро поверхности, ракурса, света, движения камеры, монтажа и концептуальных пропов из плана панели. Человека, руки, лицо, голову, исходный рекламный товар, текст и логотипы не копируй.`
          : facelessReferenceScene
            ? `@file${directorFileStart}-@file${directorFileStart + directorReferenceImageUrls.length - 1} - кадры оригинала: источник только локации, ракурса, света, рук, движения камеры, PIP, монтажа и обязательного нейтрального реквизита из плана панели. Лицо, голову и исходный рекламный товар не копируй; не копируй текст или логотипы.`
          : voiceoverBrollReference
            ? `@file${directorFileStart}-@file${directorFileStart + directorReferenceImageUrls.length - 1} - кадры оригинала: только вдохновение для макроформата, света и энергии B-roll. Лицо главного героя бери из avatar reference @file1; сцены поставь заново и не копируй исходных людей, рекламный товар, текст или логотипы.`
          : `@file${directorFileStart}-@file${directorFileStart + directorReferenceImageUrls.length - 1} - кадры оригинала: только вдохновение для макроформата, света и энергии. Лицо главного героя бери из @file1; сцену, ракурс, одежду и действие поставь заново.`
      : "",
    !avatarFreeReferenceScene && !objectOnlyReferenceScene && !facelessReferenceScene
      ? montageReference || voiceoverBrollReference
        ? "FEATURED PERSON LOCK: главный или акцентный человек берётся из @file1. Фоновые прохожие допустимы; людей из reference не копируй как нового главного героя."
        : "FEATURED PERSON LOCK: лицо и личность главного героя берутся из @file1. Фоновые люди допустимы."
      : "",
    isPipLayout && !avatarFreeReferenceScene
      ? "MACRO LAYOUT: сохрани идею PIP или collage, но размер, позицию, фон и точные переходы поставь заново под текущий сценарий."
      : "",
    objectOnlyReferenceScene
      ? "SCENE CONTINUITY LOCK: во всех панелях сохраняй одну и ту же макро поверхность, ракурс, свет и физическое положение реквизита. Не создавай человека, руки, лицо или голову между панелями."
      : facelessReferenceScene
        ? "SCENE CONTINUITY LOCK: во всех панелях сохраняй одну и ту же поверхность, ракурс, свет, руки и физическое положение реквизита. Не создавай лицо или голову между панелями."
      : voiceoverBrollReference
        ? "B-ROLL CONTINUITY: панели могут быть независимыми оригинальными сценами; если есть главный человек, это аватар из @file1."
      : "",
    !avatarFreeReferenceScene && !objectOnlyReferenceScene && !facelessReferenceScene
      ? renderStoryboardImageWardrobeContract({ continuousPresenterWardrobe, hasCanonicalReference: Boolean(canonicalFile) })
      : "",
    !avatarFreeReferenceScene && !canonicalFile && input.directorBrief?.clothing
      ? [
          "WARDROBE SUGGESTION:",
          input.directorBrief.clothing.style,
          input.directorBrief.clothing.fit_details,
          input.directorBrief.clothing.color_palette.length
            ? `colors: ${input.directorBrief.clothing.color_palette.join(", ")}`
            : "",
          input.directorBrief.clothing.adaptation_notes || "",
        ].filter(Boolean).join("; ") + (continuousPresenterWardrobe
          ? ". Use this only to choose the first outfit, then preserve it exactly for the whole reel."
          : ". Adapt freely to the new scene; clothing differences are not a failure.")
      : "",
    facelessReferenceScene
      ? "В кадре нет talking-head и взгляда в объектив: действие выполняют руки, а голос остаётся за кадром."
      : voiceoverBrollReference
        ? "Главный человек это сохранённый аватар. Он может говорить в кадре или действовать под закадровый голос; точное состояние губ не проверяется."
      : hybridDelivery
        ? "HYBRID AUDIO: произнеси реплику один раз; режиссёр сам выбирает речь в кадре или за кадром."
      : montageReference
        ? "VOICEOVER MONTAGE: голос идёт за кадром или поверх независимых кадров; talking-head взгляд выбирай только когда он помогает новой раскадровке."
        : "В talking-head кадрах используй ясный естественный ракурс и взгляд, подходящий текущей реплике.",
    continuousPresenterWardrobe
      ? "Смысл реплики определяет сцену, главный предмет и действие. Ракурс, свет, жест и точные переходы поставь заново; точную одежду сохраняй во всём ролике. Reference задаёт только общий визуальный язык. Исходный рекламный товар не копируй."
      : "Смысл реплики определяет сцену, главный предмет и действие. Ракурс, свет, одежду, жест и точные переходы поставь заново; reference задаёт только общий визуальный язык. Исходный рекламный товар не копируй.",
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
          ? `перенос: исходный рекламный товар ${frame.referenceTransfer.decisions.sourceProduct}; его упаковку и части не сохраняй; нейтральный реквизит ${frame.referenceTransfer.decisions.sourceProps}; композиция ${compactText(frame.referenceTransfer.cameraComposition || "по новой раскадровке")}; обязательный реквизит ${(frame.referenceTransfer.requiredSupportProps || []).join("; ") || "нет"}; обязательное действие ${compactText(frame.referenceTransfer.requiredReferenceAction || "нет")};`
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

function renderStoryboardImageWardrobeContract(input: {
  continuousPresenterWardrobe: boolean;
  hasCanonicalReference: boolean;
}) {
  if (input.continuousPresenterWardrobe) {
    return input.hasCanonicalReference
      ? "OUTFIT LOCK: copy the exact presenter outfit from the first approved storyboard. Keep garment type, sleeve length, neckline, color, fabric, and visible accessories unchanged across all panels and segments."
      : "OUTFIT LOCK: choose one simple presenter outfit now. Keep its exact garment type, sleeve length, neckline, color, fabric, and visible accessories unchanged across all panels and later segments.";
  }
  return "WARDROBE GUIDANCE: use a simple outfit that serves the new scene. Exact reference or cross-panel clothing continuity is not a QA requirement.";
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
