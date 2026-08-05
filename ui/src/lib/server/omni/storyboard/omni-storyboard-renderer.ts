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

export function renderCompactRussianOmniStoryboardPrompt(input: {
  storyboard: OmniStoryboardSegment;
  productName?: string;
  productPhysicalContract?: string | null;
  segmentCount?: number;
  directorBrief?: DirectorBrief | null;
}) {
  const validation = validateOmniStoryboardSegment(input.storyboard);
  if (!validation.valid) {
    throw new Error(`Invalid Omni storyboard: ${validation.errors.join(", ")}`);
  }
  const voiceoverText = renderPunctuatedVoiceover(input.storyboard, input.segmentCount);
  const frameCount = input.storyboard.frames.length;
  const preservePipLayout = isCollagePictureInPictureReference(input.directorBrief || null);
  const productFrameNumbers = input.storyboard.frames
    .map((frame, index) => isProductVisibleInStoryboardFrame(frame as unknown as Record<string, unknown>, input.productName || "") ? index + 1 : null)
    .filter((index): index is number => index !== null);
  const productAppearsInThisSegment = productFrameNumbers.length > 0;
  const productRevealFrame = productFrameNumbers[0] || null;

  return [
    `Создай динамичный разговорный ролик по раскадровке ${OMNI_STORYBOARD_FILE_PLACEHOLDER}, сохрани точно такой же визуал.`,
    `Структура видео: ровно ${frameCount} живых эпизодов по одному на каждый кадр, в том же порядке.`,
    `Оживи кадры раскадровки ${OMNI_STORYBOARD_FILE_PLACEHOLDER} как реальные сцены; не показывай саму раскадровку, телефон, экран, интерфейс, соцсети или карточки.`,
    preservePipLayout
      ? "PIP: full-screen фон; avatar lower-left cutout."
      : "",
    "filming equipment is never visible.",
    `Лицо и личность персонажа бери из avatar/character reference; одежду, свет, фон, ракурс и действия бери из раскадровки ${OMNI_STORYBOARD_FILE_PLACEHOLDER}.`,
    "Фиксируй те же волосы, пробор, аксессуары.",
    "Канонический outfit задается первым кадром первой части: один и тот же полный комплект одежды во всех частях; не меняй цвет, ткань, крой или аксессуары.",
    "WARDROBE AUTHORITY: первый outfit из раскадровки единственный; не бери одежду из avatar reference и не меняй outfit.",
    renderWardrobeLock(input.directorBrief),
    renderReferenceTransitionCue(input.directorBrief),
    renderStoryboardCameraLock(input.storyboard),
    renderVehicleCameraLock(input.directorBrief),
    "В каждом talking-head кадре персонаж смотрит прямо в объектив, даже при смене ракурса камеры.",
    productAppearsInThisSegment
      ? `Продукт бери из ${OMNI_PRODUCT_FILE_PLACEHOLDER}; не меняй упаковку; впервые покажи его только в кадре ${productRevealFrame}; дальше сохраняй в той же руке или на том же месте; не допускай исчезновения, телепортации или смены положения без движения руки.`
      : "В этом сегменте продукт вне кадра; не переноси его из reference-кадра.",
    productAppearsInThisSegment
      ? "Состояние продукта держи одинаковым."
      : "",
    productAppearsInThisSegment ? renderProductPhysicalContractForOmni(input.productPhysicalContract) : "",
    OMNI_PHYSICAL_ACTION_CONTRACT,
    "Персонаж в кадре сам произносит эти слова на русском языке:",
    voiceoverText,
    "Это одна непрерывная реплика без длинных пауз и молчания, она произносится ровно один раз от первого до последнего слова.",
    "Каждый эпизод продолжает речь со следующего еще не произнесенного слова. После последнего слова молчит.",
    "Не добавляй музыку, новые субтитры или новый текст на экран, аудиоэффекты можно.",
  ].join("\n");
}

function renderStoryboardCameraLock(storyboard: OmniStoryboardSegment) {
  const cameraMap = storyboard.frames
    .map((frame, index) => `${index + 1}=${frame.camera.trim()}`)
    .join(" | ");
  return `CAMERA AUTHORITY: follow storyboard camera. MAP: ${cameraMap}. Keep setup until change; no left-right/front-rear, seat, zoom, orbit or background changes.`;
}

function renderVehicleCameraLock(brief?: DirectorBrief | null) {
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
  return "VEHICLE CAMERA LOCK: keep one continuous camera setup inside the vehicle, with the same physical camera mount, same side of the cabin, same distance, same horizon and same seat for the woman in every frame and segment; preserve the exact front or rear seat shown in the reference; let only the visible reference cuts change the moment, never the seating position or camera location.";
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

function renderWardrobeLock(brief: DirectorBrief | null | undefined): string {
  if (!brief) return "";
  const parts = [
    brief.clothing.style,
    brief.clothing.fit_details,
    brief.clothing.color_palette.length
      ? `colors: ${brief.clothing.color_palette.join(", ")}`
      : "",
    brief.clothing.adaptation_notes || "",
  ].filter(Boolean);
  if (!parts.length) return "";
  return `WARDROBE LOCK: ${parts.join("; ")}. Identical outfit in every segment and every frame — same fabric, cut, color, and accessories. Any deviation is a generation failure.`;
}
