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

export function renderCompactRussianOmniStoryboardPrompt(input: {
  storyboard: OmniStoryboardSegment;
  productName?: string;
  productPhysicalContract?: string | null;
  segmentCount?: number;
}) {
  const validation = validateOmniStoryboardSegment(input.storyboard);
  if (!validation.valid) {
    throw new Error(`Invalid Omni storyboard: ${validation.errors.join(", ")}`);
  }
  const voiceoverText = renderPunctuatedVoiceover(input.storyboard, input.segmentCount);
  const frameCount = input.storyboard.frames.length;
  const productFrameNumbers = input.storyboard.frames
    .map((frame, index) => isProductVisibleInStoryboardFrame(frame as unknown as Record<string, unknown>, input.productName || "") ? index + 1 : null)
    .filter((index): index is number => index !== null);
  const productAppearsInThisSegment = productFrameNumbers.length > 0;

  return [
    `Создай видео по раскадровке ${OMNI_STORYBOARD_FILE_PLACEHOLDER}, сохрани точно такой же визуал.`,
    `Структура видео: ровно ${frameCount} живых эпизодов по одному на каждый кадр, в том же порядке.`,
    `Оживи кадры раскадровки ${OMNI_STORYBOARD_FILE_PLACEHOLDER} как реальные сцены, не показывай саму раскадровку, телефон, экран, интерфейс, соцсети, карточки или коллаж.`,
    "filming equipment is never visible.",
    `Лицо и личность персонажа бери из avatar/character reference; одежду, свет, фон, ракурс и действия бери из раскадровки ${OMNI_STORYBOARD_FILE_PLACEHOLDER}.`,
    "Сохраняй те же волосы, пробор, аксессуары во всех кадрах.",
    "Канонический outfit задается первым кадром первой части и повторяется без изменений во всех частях. Не заменяй футболку на свитер, рубашку, пиджак или другой верх; не меняй цвет, ткань, рукава, вырез, посадку и аксессуары.",
    "Материал одежды фиксирован первым кадром первой части: воспроизводи одно и то же волокно, плетение, плотность, фактуру, швы, крой и посадку во всех кадрах и частях.",
    "Во всех частях герой носит один и тот же полный комплект одежды с теми же слоями и деталями.",
    "В каждом talking-head кадре персонаж смотрит прямо в объектив, даже при смене ракурса камеры.",
    productAppearsInThisSegment
      ? `Продукт бери из ${OMNI_PRODUCT_FILE_PLACEHOLDER}; не меняй упаковку; в кадрах ${productFrameNumbers.join(",")} герой должен естественно держать его на уровне груди лицевой стороной к камере; остальные без товара.`
      : "В этом сегменте продукт вне кадра; не переноси его из reference-кадра.",
    productAppearsInThisSegment
      ? "Состояние продукта держи одинаковым от первого до последнего кадра: та же консистенция, та же целостность, та же упаковка и дизайн."
      : "",
    productAppearsInThisSegment ? renderProductPhysicalContractForOmni(input.productPhysicalContract) : "",
    "Персонаж в кадре сам произносит эти слова на русском языке:",
    voiceoverText,
    "Это одна непрерывная реплика, она произносится ровно один раз от первого до последнего слова.",
    "Каждый эпизод продолжает речь со следующего еще не произнесенного слова. После последнего слова персонаж замолкает.",
    "Не добавляй музыку, новые субтитры или новый текст на экран, аудиоэффекты можно.",
  ].join("\n");
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
