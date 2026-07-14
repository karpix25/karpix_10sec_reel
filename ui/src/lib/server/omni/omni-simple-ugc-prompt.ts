import type {
  OmniCreativeStrategy,
  OmniSegmentCreativePlan,
  ProductRole,
} from "@/lib/omni/creative-contract";
import type { OmniCharacterContract } from "./omni-character-contract";

export function renderSimpleFullBodyUgcPrompt(input: {
  plan: OmniSegmentCreativePlan;
  strategy: OmniCreativeStrategy;
  characterContract: OmniCharacterContract;
  productName: string;
  segmentIndex: number;
  segmentCount: number;
}) {
  const duration = input.plan.beats[2]?.endSeconds || 10;
  const props = input.plan.continuityProps
    .map((item) => `${item.name}: ${item.appearance}; начальная позиция: ${item.initialPosition}`)
    .join(" | ");
  const continuity = input.segmentIndex < input.segmentCount
    ? "Finish in a stable standing pose that can continue into the next segment."
    : "End exactly after the last spoken word, without adding another CTA.";

  return [
    `UGC style vertical video, 9:16, ${duration.toFixed(0)}s duration.`,
    "FRAMING: medium-wide full-body shot for the whole clip; the person stands in frame, visible from head to shoes or at least head to knees, with hands visible.",
    "CAMERA: authentic handheld phone camera feel, natural movement, bright domestic light, high quality visuals.",
    `SCENE: ${input.strategy.setting}.`,
    `ГЛАВНЫЙ ПЕРСОНАЖ: ${input.characterContract.identityLine}.`,
    `ОДЕЖДА: ${input.characterContract.clothingLine}.`,
    `ИСТОЧНИКИ ОБРАЗА: ${input.characterContract.sourceRuleLine}.`,
    `ПРОДУКТ: ${input.productName}. ${productLine(input.plan.productRole)}`,
    `ПАСПОРТ РЕКВИЗИТА ДЛЯ ВСЕХ ЧАСТЕЙ: ${props}.`,
    `СТАРТ РЕЧИ: первое слово точной реплики звучит в первом кадре на 0.0 секунде; герой уже стоит в кадре и смотрит в камеру.`,
    `ТОЧНАЯ РЕПЛИКА: "${input.plan.voiceoverText}"`,
    "ACTION:",
    ...input.plan.beats.map((beat) => `${beat.startSeconds.toFixed(1)}-${beat.endSeconds.toFixed(1)} sec: ${beat.action}.`),
    "SPEECH: Russian, natural enthusiastic product-review delivery, speak only the exact quote once, no subtitles.",
    `CONTINUITY: same person, outfit, room, light, product appearance, and prop layout across the segment. ${continuity}`,
  ].join("\n");
}

function productLine(role: ProductRole) {
  if (role === "hidden") return "Do not show the product in this segment; keep the story personal.";
  if (role === "background_prop") return "Keep the product visible in the wide scene on a table or counter, without a close-up.";
  return "The person naturally holds one product bottle or package in one hand while speaking to camera.";
}
