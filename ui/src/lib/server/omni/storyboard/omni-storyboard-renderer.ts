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
import { renderReferenceTransitionCue } from "./omni-storyboard-effects";
import { OMNI_PHYSICAL_ACTION_CONTRACT } from "../omni-physical-action-contract";
import { isFacelessReferenceScene, isObjectOnlyReferenceScene, resolveReferenceSceneMode, type ReferenceSceneMode } from "../omni-reference-scene-mode";
import { isAvatarFreeReferenceScene } from "../omni-reference-scene-mode";
import type { ProductRole } from "../../../omni/creative-contract";
import { isVoiceoverMontageReference, resolveReferenceFormatMode } from "../omni-reference-format-mode";
import { renderVisibleSubjectPolicy, resolveDirectorVisibleSubjectPolicy } from "../director-visibility-policy";
import { requiresContinuousPresenterWardrobe } from "../director-wardrobe";

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
  const voiceoverText = renderPunctuatedVoiceover(input.storyboard, input.segmentCount);
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
  const hiddenProductFrames = productAppearsInThisSegment && productFrameNumbers.length < frameCount
    ? "; в остальных кадрах вне кадра"
    : "";

  return [
    `Динамичный разговорный ролик по раскадровке ${OMNI_STORYBOARD_FILE_PLACEHOLDER}; сохрани визуал.`,
    `Ровно ${frameCount} живых эпизодов, по одному на кадр и в том же порядке.`,
    "Оживи панели; не показывай саму раскадровку и интерфейс соцсетей",
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
        ? "DIRECTOR-LED HYBRID: главный человек всегда сохранённый аватар. Режиссёр может выбрать речь в кадре или B-roll под закадровый голос по смыслу текущей реплики; фоновые люди допустимы."
      : "",
    renderVisibleSubjectPolicy(visibleSubjectPolicy),
    preservePipLayout
      ? "PIP: full-screen фон; avatar lower-left cutout."
      : "",
    "filming gear is never seen.",
    "VIDEO TEXTURE: raw smartphone exposure, focus breathing, and handheld energy; never glossy or studio-shot.",
    objectOnlyReferenceScene
      ? `Свет, фон, макро поверхность, ракурс и действия бери из раскадровки ${OMNI_STORYBOARD_FILE_PLACEHOLDER}; не добавляй человека, руки, лицо, голову или аватар.`
      : facelessReferenceScene
        ? `Свет, фон, ракурс, руки и действия бери из раскадровки ${OMNI_STORYBOARD_FILE_PLACEHOLDER}; не добавляй лицо, голову или аватар.`
      : animationReference
        ? `Стиль, персонажей, формы, текстуры, свет, камеру и действия бери из раскадровки ${OMNI_STORYBOARD_FILE_PLACEHOLDER}; не добавляй фотореалистичного аватара или live-action сцену.`
      : voiceoverBrollReference
        ? noPeopleReference
          ? `Свет, локации, ракурсы, монтаж и независимые действия бери из раскадровки ${OMNI_STORYBOARD_FILE_PLACEHOLDER}; не добавляй людей, рук или avatar/character reference.`
          : `Свет, локации, ракурсы, монтаж и действия бери из новой раскадровки ${OMNI_STORYBOARD_FILE_PLACEHOLDER}; личность любого главного человека бери из avatar/character reference.`
      : `Лицо и личность персонажа бери из avatar/character reference; одежду, свет, фон, ракурс и действия бери из раскадровки ${OMNI_STORYBOARD_FILE_PLACEHOLDER}.`,
    objectOnlyReferenceScene
      ? "Фиксируй одну и ту же макро поверхность, свет, реквизит и физическое положение предметов."
      : facelessReferenceScene
        ? "Фиксируй одну и ту же поверхность, реквизит и физическое положение предметов."
      : animationReference
        ? "Сохраняй одних и тех же нарисованных персонажей, пропорции, палитру, фактуры и правила движения между кадрами."
      : voiceoverBrollReference
        ? noPeopleReference
          ? "Сохраняй независимость B-roll сцен; не добавляй людей, руки или аватар."
          : "Сохраняй личность главного аватара и форму продукта; фоновые люди, одежда и сцены могут естественно меняться."
      : "Фиксируй те же волосы, пробор, аксессуары.",
    avatarFreeReferenceScene ? "" : renderStoryboardWardrobeContinuity(continuousPresenterWardrobe),
    avatarFreeReferenceScene ? "" : renderStoryboardWardrobe(input.storyboard),
    renderReferenceTransitionCue(input.directorBrief),
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
        ? "HYBRID AUDIO: произнеси точную реплику один раз. Она может звучать в кадре или за кадром по новой раскадровке; точное состояние губ не является визуальным контрактом."
      : montageReference
        ? "VOICEOVER MONTAGE: голос может идти за кадром поверх независимых кадров; talking-head взгляд выбирай только когда он помогает новой раскадровке."
        : "В каждом talking-head кадре персонаж смотрит прямо в объектив, даже при смене ракурса камеры.",
    productAppearsInThisSegment
      ? input.productRole === "digital_demo"
        ? `Продукт из ${OMNI_PRODUCT_FILE_PLACEHOLDER}: утвержденный экран мобильного продукта на смартфоне в кадрах ${productFrameNumbers.join(", ")}${hiddenProductFrames}; не превращай его в пластиковую карту или упаковку.`
        : `Продукт из ${OMNI_PRODUCT_FILE_PLACEHOLDER}: неизменная упаковка в кадрах ${productFrameNumbers.join(", ")}${hiddenProductFrames}; оживи утвержденную последовательность без телепортаций.`
      : "В этом сегменте продукт вне кадра; не переноси его из reference-кадра.",
    productAppearsInThisSegment
      ? input.productRole === "digital_demo"
        ? "Сохраняй один и тот же утвержденный экран продукта и положение смартфона в пределах действия."
        : "Состояние продукта держи одинаковым по утвержденной физической последовательности."
      : "",
    productAppearsInThisSegment && input.productRole !== "digital_demo" ? renderProductPhysicalContractForOmni(input.productPhysicalContract) : "",
    productAppearsInThisSegment && input.productRole !== "digital_demo" ? OMNI_PHYSICAL_ACTION_CONTRACT : "",
    productAppearsInThisSegment && input.productRole === "digital_demo"
      ? "DIGITAL PRODUCT: показывай только утвержденный экран продукта на смартфоне; не изображай пластиковую карту, упаковку или физический рекламный товар."
      : "",
    voiceoverBrollReference || animationReference
      ? "Точная реплика закадрового диктора на русском языке (произноси только текст в кавычках, ничего кроме него):"
      : hybridDelivery
        ? "Точная реплика на русском языке: в кадрах on_camera говорит аватар, в кадрах voiceover_only реплика звучит за кадром; произноси только текст в кавычках, ничего кроме него:"
      : "Точная реплика персонажа на русском языке (произноси только текст в кавычках, ничего кроме него):",
    `"${voiceoverText}"`,
    "Правила аудио: одна непрерывная аудиодорожка; смена кадров не перезапускает речь; произнеси строго указанную реплику в кавычках один раз. Визуальные cuts делай только по полным речевым единицам storyboard, не на остатке слова или паузе внутри фразы. После неё молчи. Не читай инструкции. Без фоновой музыки и субтитров.",
  ].join("\n");
}

function renderStoryboardWardrobeContinuity(continuousPresenterWardrobe: boolean) {
  if (continuousPresenterWardrobe) {
    return "WARDROBE CONTINUITY LOCK: this is one continuous on-screen presenter. Keep the exact storyboard outfit unchanged in every panel and independently generated segment: same garment type, sleeve length, neckline, color, fabric, and visible accessories.";
  }
  return "WARDROBE GUIDANCE: use the outfit from the new storyboard when visible. Exact reference or cross-segment clothing continuity is not required.";
}

function renderStoryboardWardrobe(storyboard: OmniStoryboardSegment) {
  const wardrobe = [...new Set(storyboard.frames.map((frame) => frame.wardrobe.trim()).filter(Boolean))];
  return wardrobe.length ? `WARDROBE FROM STORYBOARD: ${wardrobe.join(" | ")}` : "";
}

function renderStoryboardCameraLock(montageReference = false) {
  return montageReference
    ? `CAMERA AUTHORITY: follow each new panel in ${OMNI_STORYBOARD_FILE_PLACEHOLDER}. Independent montage panels may choose different setups, locations, and backgrounds; keep motion coherent inside one panel.`
    : `CAMERA AUTHORITY: follow the new panels in ${OMNI_STORYBOARD_FILE_PLACEHOLDER}. Keep each planned setup coherent until the storyboard introduces a cut.`;
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

function renderPunctuatedVoiceover(storyboard: OmniStoryboardSegment, segmentCount?: number) {
  const text = storyboard.voiceoverText.trim();
  if (/[?!]$/u.test(text)) return text;
  const mark = storyboard.segmentIndex === 1
    ? renderHookMark(text)
    : segmentCount && storyboard.segmentIndex === segmentCount
      ? "!"
      : "";
  return mark ? `${text.replace(/[.!…]+$/u, "")}${mark}` : text;
}

function renderHookMark(text: string) {
  return /^(?:почему|зачем|как|что|когда|если|вы|ты|знаете|знаешь)\b/iu.test(text) ? "?" : "!";
}
