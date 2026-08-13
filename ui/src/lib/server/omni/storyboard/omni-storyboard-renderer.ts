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

  return [
    `Динамичный разговорный ролик по раскадровке ${OMNI_STORYBOARD_FILE_PLACEHOLDER}; сохрани визуал.`,
    `Ровно ${frameCount} живых эпизодов, по одному на кадр и в том же порядке.`,
    "Оживи панели; не показывай саму раскадровку, телефон, экран, интерфейс, соцсети или карточки.",
    preservePipLayout
      ? "PIP: full-screen фон; avatar lower-left cutout."
      : "",
    "filming gear is never seen.",
    "VIDEO TEXTURE: keep the raw smartphone texture, exposure/focus breathing, and handheld energy from the storyboard; never make it glossy or studio-shot.",
    `Лицо и личность персонажа бери из avatar/character reference; одежду, свет, фон, ракурс и действия бери из раскадровки ${OMNI_STORYBOARD_FILE_PLACEHOLDER}.`,
    "Фиксируй те же волосы, пробор, аксессуары.",
    "Канонический outfit задается первым кадром первой части: один и тот же полный комплект одежды во всех частях; не меняй цвет, ткань, крой или аксессуары.",
    "WARDROBE AUTHORITY: первый outfit из раскадровки единственный; не бери одежду из avatar reference и не меняй outfit.",
    renderReferenceTransitionCue(input.directorBrief),
    renderStoryboardCameraLock(),
    renderVehicleCameraLock(input.directorBrief),
    "В каждом talking-head кадре персонаж смотрит прямо в объектив, даже при смене ракурса камеры.",
    productAppearsInThisSegment
      ? `Продукт из ${OMNI_PRODUCT_FILE_PLACEHOLDER}: неизменная упаковка в кадрах ${productFrameNumbers.join(", ")}; сначала на одной поверхности, затем взятие рукой, показ и возврат на нее. Без телепортаций.`
      : "В этом сегменте продукт вне кадра; не переноси его из reference-кадра.",
    productAppearsInThisSegment
      ? "Состояние продукта держи одинаковым по утвержденной физической последовательности."
      : "",
    productAppearsInThisSegment ? renderProductPhysicalContractForOmni(input.productPhysicalContract) : "",
    OMNI_PHYSICAL_ACTION_CONTRACT,
    "Точная реплика персонажа на русском языке (произноси только текст в кавычках, ничего кроме него):",
    `"${voiceoverText}"`,
    "Правила аудио: произнеси строго указанную реплику в кавычках один раз, плавно и без пауз. Не зачитывай технические инструкции. После завершения реплики персонаж молчит. Без фоновой музыки и субтитров.",
  ].join("\n");
}

function renderStoryboardCameraLock() {
  return `CAMERA AUTHORITY: follow each panel camera in ${OMNI_STORYBOARD_FILE_PLACEHOLDER}. Keep setup until a visible reference cut; no left-right/front-rear, seat, zoom, orbit or background changes.`;
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
  const isMovingVehicle = /(?:moving|motion|sway|vibration|handheld|driv|движущ|едет|тряск|колебан)/iu.test(referenceText);
  return [
    "VEHICLE CAMERA LOCK: keep one continuous smartphone camera position inside the vehicle, with the same side of the cabin, distance, horizon and seat in every frame and segment; preserve the exact front or rear seat shown in the reference; let only visible reference cuts change the moment, never the seating position or camera location.",
    isMovingVehicle
      ? "Preserve natural handheld micro-vibration and subtle vehicle sway from the moving car; the presenter is a passenger and never drives."
      : "Keep the natural smartphone framing from the reference; the presenter never drives.",
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
