import type { OmniStoryboardSegment } from "@/lib/omni/storyboard/omni-storyboard-types";
import { isProductVisibleInStoryboardFrame } from "./omni-intro-product-contract";
import { renderProductPhysicalStoryboardHint } from "./product-physical-contract";
import type { DirectorBrief } from "./director-analysis-types";
import { isCollagePictureInPictureReference } from "./director-layout-contract";
import { isAvatarFreeReferenceScene, isFacelessReferenceScene, isObjectOnlyReferenceScene, resolveReferenceSceneMode, type ReferenceSceneMode } from "./omni-reference-scene-mode";
import type { ProductRole } from "../../omni/creative-contract";
import { requiresContinuousPresenterWardrobe } from "./director-wardrobe";
import { isVoiceoverMontageReference, resolveReferenceFormatMode } from "./omni-reference-format-mode";
import type { ReferenceSegmentPlan } from "./reference-segment-plan";
import { resolveReferenceTransferMode } from "./omni-reference-transfer-policy";

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
  const detailedSourceTimeline = resolveReferenceTransferMode(input.directorBrief) === "full_reference";
  const strictReferencePlan = Boolean(
    input.referenceSegmentPlan && detailedSourceTimeline
  );
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
    strictReferencePlan
      ? "APPROVED STORYBOARD: use the adapted per-frame plan below. Source frames supply setting, light and visual style; the approved plan determines subject, action and product B-roll."
      : "",
    "В панелях только живые вертикальные кадры без букв, цифр, реплик, заголовков и технических подписей.",
    "Без рекламного дизайна, элементов соцсетей, водяных знаков, captions, стикеров и декора; экран продукта допустим только по product reference.",
    objectOnlyReferenceScene
      ? "OBJECT-ONLY CONTRACT: в кадре нет человека, рук, лица, головы, глаз, губ, портрета аватара или talking-head. Показывай только утверждённую поверхность, предметы и концептуальные пропы. Озвучка идёт за кадром. Не добавляй человека из avatar reference."
      : facelessReferenceScene
        ? "FACELESS HANDS-ONLY CONTRACT: в кадре нет лица, головы, глаз, губ, портрета аватара или talking-head. Показывай только руки, допустимый фрагмент корпуса и предметы, которые нужны действию. Озвучка идёт за кадром. Не добавляй человека из avatar reference."
      : strictReferencePlan
        ? "APPROVED SUBJECT DELIVERY: follow each panel below. On-camera panels show our talking avatar; product B-roll panels show only the product without people or hands."
      : voiceoverBrollReference
        ? "DIRECTOR-LED B-ROLL: создавай самостоятельные сцены под смысл реплики. Любой главный человек использует avatar reference; фоновые люди и видимая речь допустимы."
      : hybridDelivery
        ? "HYBRID: речь в кадре или за кадром задаётся speech_mode каждой утверждённой панели. Любой главный человек использует avatar reference."
      : "@file1 - avatar/character reference фиксирует лицо, пол, возраст, волосы, телосложение и личность главного героя. Фоновые люди допустимы и не обязаны повторять аватара.",
    canonicalFile
      ? strictReferencePlan
        ? `@file${canonicalFile} - continuity reference for the approved adapted storyboard. Preserve its wardrobe, location, light and product appearance; follow the subject, action and camera assigned to each panel below.`
        : objectOnlyReferenceScene
        ? `@file${canonicalFile} - эталон композиции, поверхности и реквизита из первого утверждённого storyboard. Сохрани макро поверхность, ракурс, свет и физическое положение предметов; не добавляй человека, руки, лицо или голову.`
        : facelessReferenceScene
          ? `@file${canonicalFile} - эталон композиции и реквизита из первого утверждённого storyboard. Сохрани поверхность, ракурс, свет, руки и физическое положение предметов; не добавляй лицо или голову.`
        : voiceoverBrollReference
          ? `@file${canonicalFile} - эталон монтажной композиции и B-roll ритма из первого утверждённого storyboard; лицо и личность всё равно бери из avatar reference @file1.`
        : continuousPresenterWardrobe
          ? `@file${canonicalFile} - эталон одежды из первого утверждённого storyboard. Одежду сохрани; окружение, камеру и действие бери из панелей ниже.`
          : `@file${canonicalFile} - предыдущий визуальный контекст и идентичность главного аватара. Это не точный lock одежды, камеры, локации или композиции.`
      : strictReferencePlan
        ? "Первый storyboard задаёт эталон одежды, света и внешнего вида продукта. Каждый кадр следует утверждённой адаптированной панели ниже."
        : objectOnlyReferenceScene
        ? "Первый storyboard задаёт эталон макро поверхности, света, композиции и реквизита для всех следующих частей; человека и руки не добавляй."
        : facelessReferenceScene
          ? "Первый storyboard задаёт эталон композиции, рук и реквизита для всех следующих частей ролика."
        : voiceoverBrollReference
          ? "Первый storyboard задаёт монтажный ритм и визуальную механику B-roll; avatar reference @file1 фиксирует повторяющегося визуального героя."
        : continuousPresenterWardrobe
          ? "Первый storyboard фиксирует утверждённую одежду аватара для всего ролика; следуй описанию каждой панели."
          : "Первый storyboard задаёт только идентичность главного аватара и общий визуальный контекст; точная одежда, камера и локация могут меняться по новой режиссуре.",
    repairFile
      ? `@file${repairFile} - предыдущая версия этой раскадровки. Это база для точечной правки: сохрани без изменений все панели, которые не названы в PHYSICAL REPAIR FROM PRIOR CHECK. Меняй только указанные панели и детали; не создавай новый вариант всего storyboard.`
      : "",
    productReferenceUrls.length
      ? `@file${productFileStart}${productReferenceUrls.length > 1 ? `-@file${productFileStart + productReferenceUrls.length - 1}` : ""} - product reference images: точный продукт ${input.productName}, его форма, цвет, материал и детали${input.productRole === "digital_demo" ? "; утверждённый экран на смартфоне, без физической карты или упаковки" : ""}.`
      : "Product reference не передан: продукт не показывай.",
    directorReferenceImageUrls.length
      ? strictReferencePlan
        ? `@file${directorFileStart}-@file${directorFileStart + directorReferenceImageUrls.length - 1} - кадры оригинала: источник локации, света, композиции и характера камеры. Действия и видимость человека заданы в адаптированных панелях ниже; не копируй исходных людей, товар, текст или логотипы.`
      : voiceoverBrollReference
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
      ? strictReferencePlan
        ? "FEATURED PERSON LOCK: use @file1 for the avatar's identity in the assigned presenter panels. Product B-roll panels contain no avatar, people or hands."
        : montageReference || voiceoverBrollReference
        ? "FEATURED PERSON LOCK: главный или акцентный человек берётся из @file1. Фоновые прохожие допустимы; людей из reference не копируй как нового главного героя."
        : "FEATURED PERSON LOCK: лицо и личность главного героя берутся из @file1. Фоновые люди допустимы."
      : "",
    isPipLayout && !avatarFreeReferenceScene
      ? strictReferencePlan
        ? "MACRO LAYOUT LOCK: preserve the analyzed PIP/collage composition and positions in the assigned presenter/thematic panels. Product B-roll is a separate product-only panel without an avatar overlay."
        : "REFERENCE LAYOUT: оригинал целиком в PIP/collage; не делай centered talking-head. Сохрани идею PIP, но размер, позицию, фон и точные переходы поставь заново под текущий сценарий."
      : "",
    objectOnlyReferenceScene
      ? "SCENE CONTINUITY LOCK: во всех панелях сохраняй одну и ту же макро поверхность, ракурс, свет и физическое положение реквизита. Не создавай человека, руки, лицо или голову между панелями."
      : facelessReferenceScene
        ? "SCENE CONTINUITY LOCK: во всех панелях сохраняй одну и ту же поверхность, ракурс, свет, руки и физическое положение реквизита. Не создавай лицо или голову между панелями."
      : strictReferencePlan
        ? "SCENE CONTINUITY: preserve the approved panels' location, light, composition and product state. Change setups only at the planned montage cuts; use the assigned adapted subject and action."
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
        ].filter(Boolean).join("; ") + (strictReferencePlan
          ? ". Use only as an avatar-compatible source-wardrobe mapping; preserve the source color, material, silhouette, fit, formality, and layer."
          : continuousPresenterWardrobe
          ? ". Use this only to choose the first outfit, then preserve it exactly for the whole reel."
          : ". Adapt freely to the new scene; clothing differences are not a failure.")
      : "",
    strictReferencePlan
      ? "APPROVED AUDIO: follow each panel's speech_mode below, including the approved replacement of product interactions with voiceover-only product B-roll."
      : facelessReferenceScene
      ? "В кадре нет talking-head и взгляда в объектив: действие выполняют руки, а голос остаётся за кадром."
      : voiceoverBrollReference
        ? "Главный человек это сохранённый аватар. Он может говорить в кадре или действовать под закадровый голос; точное состояние губ не проверяется."
      : hybridDelivery
        ? "HYBRID AUDIO: в on_camera панелях аватар говорит, в voiceover_only панелях тот же голос продолжается за кадром."
      : montageReference
        ? "VOICEOVER MONTAGE: голос идёт за кадром или поверх независимых кадров; talking-head взгляд выбирай только когда он помогает новой раскадровке."
        : "В on_camera кадрах герой смотрит прямо в объектив; в voiceover_only кадрах взгляд подчинён действию.",
    strictReferencePlan
      ? "Утверждённая панель задаёт структуру кадра и действие; исходные взаимодействия с чужим товаром не возвращай."
      : continuousPresenterWardrobe
      ? "Следуй утверждённым действию, свету и камере каждой панели; сохрани точную одежду во всём ролике."
      : "Следуй утверждённым действию, одежде, свету и камере каждой панели.",
    "Исходные рекламные товары никогда не являются нейтральным реквизитом: замени их утверждённым продуктом или убери. Нейтральный реквизит оставляй вторичным.",
    productAppearsInThisSegment ? renderStoryboardImageProductContract({
      storyboard: input.storyboard,
      productName: input.productName,
      productRole: input.productRole,
      productFrameNumbers,
      productRevealFrame,
    }) : "",
    productPhysicalHint && input.productRole !== "digital_demo"
      ? `PRODUCT APPEARANCE ONLY: ${productPhysicalHint}. Ignore any action or contact wording in this hint; product B-roll has no people or hands.`
      : "",
    productAppearsInThisSegment && input.productRole === "digital_demo"
      ? "DIGITAL PRODUCT: показывай только утвержденный экран продукта на смартфоне; не изображай пластиковую карту, упаковку или физический товар."
      : "",
    input.repairInstructions?.length
      ? `PHYSICAL REPAIR FROM PRIOR CHECK: ${input.repairInstructions.join("; ")}.`
      : "",
    "2 сек на панель.",
    detailedSourceTimeline
      ? "ADAPTED PLAN PRIORITY: preserve the approved panel's composition, camera, setting and light. Its assigned product B-roll and speech mode take precedence over source-person actions."
      : "",
    ...input.storyboard.frames.map((frame, index) => {
      const productVisible = isProductVisibleInStoryboardFrame(
        frame as unknown as Record<string, unknown>,
        input.productName,
      );
      return [
        `Кадр ${index + 1}:`,
        productVisible ? "subject=product_only; avatar_allowed=false;" : "",
        `смысл кадра: ${frame.spokenText}.`,
        frame.speechMode ? `speech_mode: ${frame.speechMode};` : "",
        `действие: ${frame.visualAction}; камера: ${frame.camera}; окружение: ${frame.environment};${productVisible ? "" : ` одежда: ${frame.wardrobe};`}`,
        frame.effectNotes ? `переход: ${frame.effectNotes};` : "",
        frame.referenceTransfer?.requiredSupportProps?.length
          ? `вторичный реквизит: ${frame.referenceTransfer.requiredSupportProps.join("; ")};`
          : "",
        productReferenceUrls.length
          ? productVisible
            ? `продукт: ${frame.productPlacement};`
            : "продукт в этом кадре не показывай;"
          : `предметы: ${compactText(frame.productPlacement)};`,
      ].join(" ");
    }),
  ].filter(Boolean).join("\n");
}

function renderStoryboardImageProductContract(input: {
  storyboard: OmniStoryboardSegment;
  productName: string;
  productRole?: ProductRole;
  productFrameNumbers: readonly number[];
  productRevealFrame: number | null;
}) {
  const visibleFrames = new Set(input.productFrameNumbers);
  const hiddenFrames = input.storyboard.frames
    .map((_, index) => index + 1)
    .filter((frameNumber) => !visibleFrames.has(frameNumber));
  const identity = input.productRole === "digital_demo"
    ? `Утвержденный цифровой продукт «${input.productName}» показывай только на одном и том же смартфоне.`
    : `Утвержденный продукт «${input.productName}» сохраняй как один и тот же физический объект без подмены.`;
  return [
    identity,
    `PRODUCT FRAME CONTRACT: Продукт впервые появляется только в панели ${input.productRevealFrame}; показывай его в панелях ${[...visibleFrames].join(", ")} и не показывай в панелях ${hiddenFrames.join(", ") || "нет"}.`,
    "Товарные B-roll без людей и рук: продукт неподвижен на устойчивой опоре, меняется только камера или фокус. Внутри непрерывного плана сохрани объект и опору; отдельная склейка может вернуть аватара без товара.",
  ].join("\n");
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
