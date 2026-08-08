import type { DirectorBrief } from "../director-analysis-types";
import type { ReferenceTransferPolicy } from "../omni-reference-transfer-policy";

const SOURCE_TOPIC_PATTERN =
  /retinol|spf|collagen|cream|powder|principle|крем|пудр|ретинол|спф|коллаген|принцип|кож|уход|косметолог|врач|ретинолов/iu;
const SOURCE_PRODUCT_PATTERN =
  /product|brand|package|packaging|box|bottle|jar|tube|sachet|cream|serum|supplement|продукт|бренд|упаков|короб|бутыл|баноч|тюбик|пакет|крем|сыворот|добавк/iu;
const PRODUCT_CARD_PATTERN =
  /full[-\s]?frame|full[-\s]?screen|product overlay|product card|packaging insert|cutaway|insert|overlay|полноэкран|карточк|перебив|вставк/iu;
const NUMBERED_REVEAL_PATTERN =
  /number(?:ed)?|\b[123]\b|list item|principle|step|цифр|номер|пункт|принцип|шаг/iu;

export function selectStoryboardReferenceAction(input: {
  brief?: DirectorBrief | null;
  policy?: ReferenceTransferPolicy;
  productName: string;
  productVisible: boolean;
  segmentIndex: number;
  segmentCount: number;
  frameIndex: number;
  frameCount: number;
}) {
  if (input.policy?.omitRawDirectorGuidance) return "";
  const beats = input.brief?.action_beats
    ?.filter((beat) => beat.action_description || beat.actor_gesture)
    .slice()
    .sort((left, right) => left.timestamp_sec - right.timestamp_sec) || [];
  if (!beats.length) return "";

  const firstTimestamp = beats[0].timestamp_sec;
  const lastTimestamp = beats[beats.length - 1].timestamp_sec;
  const reelPosition = ((input.segmentIndex - 1) + (input.frameIndex - 0.5) / input.frameCount) /
    Math.max(1, input.segmentCount);
  const targetTimestamp = firstTimestamp + (lastTimestamp - firstTimestamp) * clamp(reelPosition);
  const nearest = beats.reduce((best, beat) =>
    Math.abs(beat.timestamp_sec - targetTimestamp) < Math.abs(best.timestamp_sec - targetTimestamp) ? beat : best
  );
  const action = adaptReferenceAction(nearest.action_description, input.productName, input.productVisible);
  const gesture = SOURCE_PRODUCT_PATTERN.test(nearest.actor_gesture) ? "" : nearest.actor_gesture;
  return compactText([action, gesture].filter(Boolean).join("; "), 220);
}

function adaptReferenceAction(value: string, productName: string, productVisible: boolean) {
  const normalized = compactText(value, 160);
  if (!normalized) return "";
  const hasNumberedReveal = NUMBERED_REVEAL_PATTERN.test(normalized);
  if (SOURCE_PRODUCT_PATTERN.test(normalized) || SOURCE_TOPIC_PATTERN.test(normalized)) {
    if (PRODUCT_CARD_PATTERN.test(normalized)) {
      return productVisible
        ? `полноэкранная продуктовая перебивка: только ${productName} по supplied product reference, с композицией, цветовым ритмом${hasNumberedReveal ? " и структурным номером" : ""} оригинала`
        : `полноэкранная тематическая перебивка по текущей реплике${hasNumberedReveal ? " со структурным номером" : ""}, без исходного продукта и упаковки`;
    }
    return productVisible
      ? `герой держит ${productName} вместо исходного продукта, без дополнительной коробки или упаковки`
      : "герой говорит в камеру с нейтральным жестом, без исходного продукта и упаковки";
  }
  if (hasNumberedReveal) {
    return "структурный номер пункта из соответствующего reference-кадра; без исходного текста и чужого продукта";
  }
  return normalized;
}

function compactText(value: string, maxLength: number) {
  const cleaned = value.replace(/\s+/gu, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength).replace(/\s+\S*$/u, "").trim();
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}
