import {
  validateOmniStoryboardSegment,
} from "../../../omni/storyboard/omni-storyboard-contract";
import type { OmniStoryboardSegment } from "../../../omni/storyboard/omni-storyboard-types";
import {
  OMNI_PRODUCT_FILE_PLACEHOLDER,
  OMNI_STORYBOARD_FILE_PLACEHOLDER,
} from "./omni-storyboard-file-reference";
import { isProductVisibleInStoryboardFrame } from "../omni-intro-product-contract";
import { renderProductPhysicalContractForOmni } from "../product-physical-contract";
import type { DirectorBrief } from "../director-analysis-types";
import { isCollagePictureInPictureReference } from "../director-layout-contract";
import { isFacelessReferenceScene, isObjectOnlyReferenceScene, resolveReferenceSceneMode, type ReferenceSceneMode } from "../omni-reference-scene-mode";
import { isAvatarFreeReferenceScene } from "../omni-reference-scene-mode";
import type { ProductRole } from "../../../omni/creative-contract";
import { isVoiceoverMontageReference, resolveReferenceFormatMode } from "../omni-reference-format-mode";
import { renderVisibleSubjectPolicy, resolveDirectorVisibleSubjectPolicy } from "../director-visibility-policy";
import { requiresContinuousPresenterWardrobe } from "../director-wardrobe";
import { renderOmniStoryboardTimeline } from "./omni-storyboard-timeline";

export function renderCompactRussianOmniStoryboardPrompt(input: {
  storyboard: OmniStoryboardSegment;
  productName?: string;
  productPhysicalContract?: string | null;
  productRole?: ProductRole;
  segmentCount?: number;
  directorBrief?: DirectorBrief | null;
  referenceSceneMode?: ReferenceSceneMode;
}) {
  const validation = validateOmniStoryboardSegment(input.storyboard);
  if (!validation.valid) {
    throw new Error(`Invalid Omni storyboard: ${validation.errors.join(", ")}`);
  }
  const voiceoverText = input.storyboard.voiceoverText.trim();
  const frameCount = input.storyboard.frames.length;
  const referenceSceneMode = input.referenceSceneMode || resolveReferenceSceneMode(input.directorBrief);
  const referenceFormatMode = resolveReferenceFormatMode(input.directorBrief);
  const montageReference = isVoiceoverMontageReference(referenceFormatMode);
  const continuousPresenterWardrobe = requiresContinuousPresenterWardrobe({ referenceFormatMode, referenceSceneMode });
  const facelessReferenceScene = isFacelessReferenceScene(referenceSceneMode);
  const avatarFreeReferenceScene = isAvatarFreeReferenceScene(referenceSceneMode);
  const voiceoverBrollReference = referenceSceneMode === "voiceover_broll";
  const animationReference = referenceSceneMode === "animation";
  const visibleSubjectPolicy = resolveDirectorVisibleSubjectPolicy(input.directorBrief);
  const noPeopleReference = visibleSubjectPolicy === "no_people";
  const deliveryModes = new Set(input.storyboard.frames
    .map((frame) => frame.speechMode || frame.physicalPlan?.speechMode)
    .filter((mode): mode is "on_camera" | "voiceover_only" => mode === "on_camera" || mode === "voiceover_only"));
  const hybridDelivery = deliveryModes.has("on_camera") && deliveryModes.has("voiceover_only");
  const objectOnlyReferenceScene = isObjectOnlyReferenceScene(referenceSceneMode);
  const preservePipLayout = isCollagePictureInPictureReference(input.directorBrief || null) && !avatarFreeReferenceScene && !noPeopleReference;
  const productFrameNumbers = input.storyboard.frames
    .map((frame, index) => isProductVisibleInStoryboardFrame(frame as unknown as Record<string, unknown>, input.productName || "") ? index + 1 : null)
    .filter((index): index is number => index !== null);
  const productAppearsInThisSegment = productFrameNumbers.length > 0;

  return [
    `Динамичный разговорный ролик по раскадровке ${OMNI_STORYBOARD_FILE_PLACEHOLDER}; сохрани визуал.`,
    `Оживи ${frameCount} панелей в утверждённом порядке на весь сегмент. Раскадровка служит визуальным ориентиром; итог состоит из живых кадров.`,
    objectOnlyReferenceScene
      ? "OBJECT-ONLY: голос за кадром; в кадре только утверждённая поверхность, предметы и концептуальные пропы; человека, рук, лица, головы и talking-head framing нет."
      : facelessReferenceScene
        ? "FACELESS HANDS-ONLY: голос за кадром; в кадре только руки, допустимый фрагмент корпуса и физический реквизит; лица, головы и talking-head framing нет."
      : animationReference
        ? "ANIMATION: сохрани иллюстрированный или анимационный стиль, персонажей, формы, текстуры, камеру и монтаж раскадровки; не добавляй живого ведущего."
      : voiceoverBrollReference
        ? noPeopleReference
          ? "VOICEOVER B-ROLL: голос за кадром; независимые B-roll кадры не содержат людей, рук, аватара, talking-head или lip-sync."
          : "DIRECTOR-LED B-ROLL: оживи новые сцены раскадровки; любой главный человек использует сохранённый аватар. Фоновые люди и видимая речь допустимы."
      : hybridDelivery
        ? "Главный человек всегда сохранённый аватар. Речь в кадре и B-roll следуют утверждённому временному плану ниже."
      : "",
    renderVisibleSubjectPolicy(visibleSubjectPolicy),
    preservePipLayout
      ? "PIP: сохрани расположение, размер и композицию слоёв из утверждённой раскадровки. Товарные B-roll показывай отдельным кадром без слоя аватара."
      : "",
    "No visible filming gear.",
    "VIDEO: сохрани фактуру изображения, свет и стиль съёмки утверждённой раскадровки.",
    objectOnlyReferenceScene
      ? `VISUAL AUTHORITY: свет, фон, макро поверхность, ракурс и действия бери только из раскадровки ${OMNI_STORYBOARD_FILE_PLACEHOLDER}; не добавляй человека, руки, лицо, голову или аватар.`
      : facelessReferenceScene
        ? `VISUAL AUTHORITY: свет, фон, ракурс, руки и действия бери только из раскадровки ${OMNI_STORYBOARD_FILE_PLACEHOLDER}; не добавляй лицо, голову или аватар.`
      : animationReference
        ? `VISUAL AUTHORITY: стиль, персонажей, формы, текстуры, свет, камеру и действия бери только из раскадровки ${OMNI_STORYBOARD_FILE_PLACEHOLDER}; не добавляй фотореалистичного аватара или live-action сцену.`
      : voiceoverBrollReference
        ? noPeopleReference
          ? `VISUAL AUTHORITY: локации, ракурсы, монтаж и действия бери только из раскадровки ${OMNI_STORYBOARD_FILE_PLACEHOLDER}; не добавляй людей, рук или avatar/character reference.`
          : `VISUAL AUTHORITY: локации, ракурсы, монтаж и действия бери только из раскадровки ${OMNI_STORYBOARD_FILE_PLACEHOLDER}; лицо и личность главного человека бери из avatar/character reference.`
      : `VISUAL AUTHORITY: одежду, свет, фон, ракурс и действия бери из раскадровки ${OMNI_STORYBOARD_FILE_PLACEHOLDER}; это единственный источник этих визуальных фактов. Лицо и личность персонажа бери из avatar/character reference.`,
    avatarFreeReferenceScene
      ? ""
      : continuousPresenterWardrobe
        ? "WARDROBE CONTINUITY: сохраняй один и тот же комплект одежды из storyboard во всех панелях и сегментах."
        : "WARDROBE: используй одежду, показанную в текущем storyboard.",
    avatarFreeReferenceScene ? "" : "Фиксируй те же волосы, пробор, аксессуары по avatar/character reference.",
    renderStoryboardCameraLock(montageReference),
    renderVehicleCameraLock(input.directorBrief, montageReference),
    objectOnlyReferenceScene
      ? "Не показывай talking-head, человека, руки или взгляд в объектив; реплика звучит за кадром."
      : facelessReferenceScene
        ? "Не показывай talking-head и взгляд в объектив; реплика звучит за кадром."
      : animationReference
        ? "Не добавляй живого ведущего, фотореалистичный talking-head или live-action lip-sync; реплика звучит в стиле утвержденной анимации."
      : voiceoverBrollReference
        ? noPeopleReference
          ? "Не показывай людей, руки, talking-head или lip-sync; реплика звучит за кадром поверх независимых B-roll кадров."
          : "Произнеси точную реплику один раз. Она может звучать в кадре или за кадром по новой раскадровке; состояние губ не является контрактом."
      : hybridDelivery
        ? "HYBRID AUDIO: в кадрах on_camera аватар говорит с синхронной артикуляцией; в кадрах voiceover_only та же речь продолжается за кадром."
      : montageReference
        ? "VOICEOVER MONTAGE: следуй speech_mode каждой панели; в on_camera аватар говорит в объектив, в voiceover_only тот же голос продолжается за кадром."
        : "В каждом talking-head кадре персонаж смотрит прямо в объектив, даже при смене ракурса камеры.",
    renderProductVisibilityContract({
      productRole: input.productRole,
      productFrameNumbers,
    }),
    productAppearsInThisSegment && input.productRole !== "digital_demo" ? renderProductPhysicalContractForOmni(input.productPhysicalContract) : "",
    productAppearsInThisSegment && input.productRole === "digital_demo"
      ? "DIGITAL PRODUCT: показывай только утвержденный экран продукта на смартфоне; не изображай пластиковую карту, упаковку или физический рекламный товар."
      : "",
    renderOmniStoryboardTimeline(input.storyboard, input.productName || ""),
    voiceoverBrollReference || animationReference
      ? "Точная реплика закадрового диктора на русском языке (произноси только текст в кавычках, ничего кроме него):"
      : hybridDelivery
        ? "Точная реплика на русском языке: в кадрах on_camera говорит аватар, в кадрах voiceover_only реплика звучит за кадром; произноси только текст в кавычках, ничего кроме него:"
      : "Точная реплика персонажа на русском языке (произноси только текст в кавычках, ничего кроме него):",
    `"${voiceoverText}"`,
    "Правила аудио: одна непрерывная реплика на весь сегмент, ровный разговорный темп и чёткие окончания. Смена панели или монтажная склейка не перезапускает речь и не требует паузы каждые две секунды. Короткие естественные паузы следуют смыслу и пунктуации. Произнеси строго указанный текст один раз, без добавленных слов, междометий и повторов; не ускоряй сложные слова до потери разборчивости. После окончания текста не добавляй речь. Не читай инструкции. Без фоновой музыки и субтитров.",
  ].join("\n");
}

function renderStoryboardCameraLock(montageReference = false) {
  return montageReference
    ? `CAMERA AUTHORITY: follow each new panel in ${OMNI_STORYBOARD_FILE_PLACEHOLDER}. Independent montage panels may choose different setups, locations, and backgrounds; keep motion coherent inside one panel.`
    : `CAMERA AUTHORITY: follow the new panels in ${OMNI_STORYBOARD_FILE_PLACEHOLDER}. Keep each planned setup coherent until the storyboard introduces a cut.`;
}

function renderProductVisibilityContract(input: {
  productRole?: ProductRole;
  productFrameNumbers: readonly number[];
}) {
  if (!input.productFrameNumbers.length) {
    return "PRODUCT FRAME CONTRACT: продукт вне кадра; не переноси его из reference-кадра и не добавляй самовольно.";
  }

  const frames = input.productFrameNumbers.join(", ");
  const productIdentity = input.productRole === "digital_demo"
    ? `Продукт из ${OMNI_PRODUCT_FILE_PLACEHOLDER}: утвержденный экран мобильного продукта на смартфоне показывай только в кадрах ${frames}; не превращай его в пластиковую карту или упаковку.`
    : `Продукт из ${OMNI_PRODUCT_FILE_PLACEHOLDER}: неизменная упаковка и одна и та же утвержденная форма продукта; показывай только в кадрах ${frames}, без подмены другим товаром.`;

  return [
    productIdentity,
    "PRODUCT FRAME CONTRACT: только отдельный product B-roll без людей и рук; продукт неподвижен на устойчивой поверхности, меняется только ракурс или фокус камеры. Видимость и положение заданы в панелях.",
  ].join("\n");
}

function renderVehicleCameraLock(brief?: DirectorBrief | null, montageReference = false) {
  if (!brief) return "";
  const referenceText = [
    brief.atmosphere.setting,
    brief.atmosphere.mood,
    ...brief.camera.shot_types,
    ...brief.action_beats.flatMap((beat) => [beat.action_description, beat.actor_gesture]),
  ].filter(Boolean).join(" ");
  if (!/(?:car|vehicle|automobile|машин|автомобил|салон|сидень|передн(?:ем|ее)|задн(?:ем|ее) сиденье)/iu.test(referenceText)) {
    return "";
  }
  const isMovingVehicle = /(?:moving|motion|sway|vibration|handheld|driv|движущ|едет|тряск|колебан)/iu.test(referenceText);
  return [
    montageReference
      ? "VEHICLE DIRECTION: each independent cut may choose a clear passenger viewpoint; preserve the featured avatar identity and never show the presenter driving."
      : "VEHICLE CAMERA: keep a coherent smartphone passenger viewpoint inside each planned scene; the storyboard may introduce a clear new angle at a cut.",
    isMovingVehicle
      ? "Use natural handheld micro-vibration and subtle vehicle sway; the presenter is a passenger and never drives."
      : "Use natural smartphone framing; the presenter never drives.",
  ].join(" ");
}
