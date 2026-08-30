import type {
  PhysicalActionKind,
  PhysicalFramePlan,
  PhysicalObjectState,
  PhysicalSpeechMode,
} from "../../omni/physical-scene-types";
import { buildProductBrollAction } from "./omni-product-broll-contract";

const CUTAWAY_PATTERN = /cutaway|insert|macro|product close|b[-\s]?roll|voiceover|крупн(?:ый|ом) кадр|перебив|предметн(?:ый|ая) кадр|закадр/iu;
const HIDDEN_PATTERN = /(?:вне кадра|не виден|скрыт|hidden|off\s*camera|only thematic objects|только тематические объекты)/iu;
const SURFACE_PATTERN = /(?:на столе|на\s+(?:\p{L}+\s+){0,3}поверхности|на полке|лежит|стоит|on (?:the )?(?:table|surface|shelf)|resting on)/iu;
const HOLDING_PATTERN = /(?:держит|держать|в руках|holding|holds|in one hand|(?<!\p{L})одной рукой|в одну руку|в одной руке|(?<!\p{L})двумя руками|в двух руках)/iu;
const PRODUCT_PATTERN = /(?:продукт|товар|product|package|упаков|баноч|бутыл|капсул|порош|крем|collagen|коллаген)/iu;
const MULTIPLE_HELD_OBJECTS_PATTERN = /(?:несколько предметов|два предмета|multiple objects|two objects|(?:держит|holding|holds|в руках)[^.;]{0,90}(?: и | and |,\s*))/iu;
const OBJECT_INTERACTION_PATTERN = /(?:держит|держать|в руках|holding|holds|показывает|показать|showing|shows|кус(?:ает|ать|ил)|eat(?:s|ing)?|bite(?:s|ing)?|drink(?:s|ing)?)/iu;
const BOTH_CHEEKS_PATTERN = /(?:обеих?\s+щек|обе\s+щеки|both\s+cheeks)/iu;
const ONE_CHEEK_PATTERN = /(?:одной\s+щек|одну\s+щеку|one\s+cheek)/iu;
const HANDS_TO_FACE_PATTERN = /(?:обе\s+руки\s+(?:у|к)\s+лица|both\s+hands[^.;]{0,80}(?:face|jawline|cheek|щек|лиц))/iu;
const FACE_TOUCH_PATTERN = /(?:обеих?\s+щек|обе\s+щеки|одной\s+щек|одну\s+щеку|обе\s+руки\s+(?:у|к)\s+лица|both\s+cheeks|one\s+cheek|hands?[^.;]{0,80}(?:face|jawline|cheek))/iu;
const FACE_TOUCH_SPEECH_PATTERN = /(?:кож[аеиу]|лиц[аоеу]|щёк|щек|челюст|подбород|лоб|морщин|высып|акне|покраснен|упругост|очища|умыва|уход|крем|сыворот|пенк|нанос|skin|face|cheek|jawline|chin|forehead|wrinkl|acne|redness|cleanse|wash|skincare|apply)/iu;
const CONSUMPTION_PATTERN = /(?:\beat\w*|\bbite\w*|\bchew\w*|\bdrink\w*|\bswallow\w*|\bsip\w*|\btast\w*|\bconsum\w*|into\s+(?:the\s+)?mouth|liquid[^.;]{0,60}(?:lips|mouth)|\bpour\w*[^.;]{0,60}(?:lips|mouth)|кус\w*|жев\w*|пив\w*|пь\w*|отпив\w*|отхлеб\w*|выпив\w*|глот\w*|откус\w*|съед\w*|пробу\w*|дегуст\w*|смаку\w*|употребл\w*|в\s+рот|во\s+рту|жидк\w*[^.;]{0,60}(?:губ|рот)|ль[её]т[^.;]{0,60}(?:губ|рот)|(?<!\p{L})ест(?:ь)?(?=\s|$|[,.!?])|принима(?:ет|ть)(?=\s|$|[,.!?])|прием(?=\s|$|[,.!?])|приём(?=\s|$|[,.!?]))/iu;
const DRIVING_PATTERN = /(?:\bdriv(?:e|es|ing)?\b|\bsteer(?:s|ing)?\b|за рулем|за рулём|ведет машину|ведёт машину)/iu;
const PICK_UP_PATTERN = /(?:берет|берёт|поднимает|pick\s*up|picks\s*up)/iu;
const PUT_DOWN_PATTERN = /(?:клад[её]т|клад(?:ут|у|и|ите|ем|ла|ли)|став(?:ит|ят|ить|лю|ила|или)|полож(?:ит|ил|ила|или|ить|у|ите)|убирает|откладывает|put\s*down|places?)/iu;
const HANDOFF_PATTERN = /(?:передает|передаёт|handoff|hands?\s+(?:it|the object)\s+to)/iu;
const FOREIGN_PRODUCT_REFERENCE_PATTERN = /(?:product|brand|package|packaging|label|jar|bottle|box|tube|sachet|snack|food|drink|cream|serum|supplement|vitamin|apple|banana|fruit|vegetable|коллаген|сыр|морков|перекус|яблок|банан|фрукт|овощ|продукт|товар|бренд|упаков|этикет|баноч|бутыл|короб|тюбик|пакет|еда|напит|крем|сыворот|добавк|витамин)/iu;
const FOREIGN_PACKAGED_PRODUCT_PATTERN = /(?:product|brand|package|packaging|label|jar|bottle|box|tube|sachet|cream|serum|supplement|vitamin|коллаген|продукт|товар|бренд|упаков|этикет|баноч|бутыл|короб|тюбик|пакет|крем|сыворот|добавк|витамин)/iu;
const NEGATED_PRODUCT_REFERENCE_PATTERN = /без\s+(?:чужих?\s+)?(?:product|package|packaging|продукт|товар|упаков)/iu;
const SOURCE_PRODUCT_OFF_CAMERA_PATTERN = /(?:source\s+product|исходный\s+рекламный\s+предмет)[^.;]{0,120}(?:вне\s+кадра|off\s*camera)/iu;

export function hasConsumptionAction(value: string) {
  return CONSUMPTION_PATTERN.test(value);
}

export function hasDrivingAction(value: string) {
  return DRIVING_PATTERN.test(value);
}

export function hasMultipleHeldObjects(value: string) {
  return MULTIPLE_HELD_OBJECTS_PATTERN.test(value);
}

export function isFaceTouchAction(value: string) {
  return FACE_TOUCH_PATTERN.test(value);
}

export function isFaceTouchSemanticallyRelevant(spokenText: string) {
  return FACE_TOUCH_SPEECH_PATTERN.test(spokenText);
}

export function hasForeignReferenceProduct(value: string, productName: string) {
  return FOREIGN_PRODUCT_REFERENCE_PATTERN.test(value) &&
    !NEGATED_PRODUCT_REFERENCE_PATTERN.test(value) &&
    !mentionsProduct(value, productName);
}

export function normalizeVehicleContext(value: string) {
  return value
    .replace(/за рулем|за рулём|ведет машину|ведёт машину/giu, "едет пассажиром в движущемся автомобиле")
    .replace(/\bdriv(?:e|es|ing)?\b|\bsteer(?:s|ing)?\b/giu, "пассажир в движущемся автомобиле");
}

export function repairReferenceAction(input: {
  action: string;
  spokenText: string;
  productName: string;
  productVisible: boolean;
  referenceSupportProps?: readonly string[];
}) {
  const action = input.action.trim();
  if (!action) return action;
  const hasSpeech = Boolean(input.spokenText.trim());
  const hasDriving = hasDrivingAction(action);
  const hasConsumption = hasConsumptionAction(action);
  const hasMultipleObjects = hasMultipleHeldObjects(action);
  const interactsWithObject = OBJECT_INTERACTION_PATTERN.test(action);
  const product = input.productName.trim() || "продукт";
  const preservesSupportProp = hasReferenceSupportProp(action, input.referenceSupportProps);

  if (hasDriving) {
    return input.productVisible
      ? buildProductBrollAction(product)
      : "герой едет пассажиром в движущемся автомобиле и спокойно говорит в камеру с нейтральным жестом";
  }
  if (isFaceTouchAction(action) && !isFaceTouchSemanticallyRelevant(input.spokenText)) {
    return input.productVisible
      ? buildProductBrollAction(product)
      : "герой спокойно говорит в камеру с нейтральным жестом, без касания лица";
  }
  if (hasForeignPackagedProduct(action, product) && !preservesSupportProp) {
    return input.productVisible
      ? buildProductBrollAction(product)
      : "герой спокойно говорит в камеру с нейтральным жестом, без чужих продуктов и упаковок";
  }
  if (input.productVisible && interactsWithObject && !mentionsProduct(action, product)) {
    return buildProductBrollAction(product);
  }
  if (hasConsumption && hasSpeech && !CUTAWAY_PATTERN.test(action)) {
    if (preservesSupportProp) {
      return buildProductBrollAction(product);
    }
    return "герой спокойно говорит в камеру с нейтральным жестом, без приёма пищи";
  }
  if (hasMultipleObjects && input.productVisible) {
    return buildProductBrollAction(product);
  }
  if (interactsWithObject && hasSpeech && !input.productVisible && !preservesSupportProp) {
    return "герой показывает только один предмет из текущей реплики одной рукой; остальные предметы вне кадра";
  }
  return action;
}

function hasReferenceSupportProp(action: string, props: readonly string[] | undefined) {
  if (!props?.length) return false;
  const actionTokens = significantTokens(action);
  return props.some((prop) => {
    const tokens = significantTokens(prop);
    return [...tokens].some((token) => actionTokens.has(token));
  });
}

function significantTokens(value: string) {
  return new Set(
    value.toLocaleLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || []
  );
}

function hasForeignPackagedProduct(value: string, productName: string) {
  return FOREIGN_PACKAGED_PRODUCT_PATTERN.test(value) &&
    !SOURCE_PRODUCT_OFF_CAMERA_PATTERN.test(value) &&
    !NEGATED_PRODUCT_REFERENCE_PATTERN.test(value) &&
    !mentionsProduct(value, productName);
}

export function buildPhysicalFramePlan(input: {
  productName: string;
  spokenText: string;
  visualAction: string;
  camera: string;
  productPlacement: string;
  speechMode?: PhysicalSpeechMode;
}): PhysicalFramePlan {
  const actionText = `${input.visualAction} ${input.productPlacement}`;
  const speechMode: PhysicalSpeechMode = input.speechMode || (input.spokenText.trim()
    ? CUTAWAY_PATTERN.test(`${input.visualAction} ${input.camera}`) ? "voiceover_only" : "on_camera"
    : "silent");
  const productState = classifyProductState(actionText, input.productName);
  const productId = `product:${slug(input.productName) || "main"}`;
  const productVisible = productState !== "hidden" && productState !== "unknown";
  const productHeld = productState === "held";
  const actionKind = detectAction(actionText);
  const requiredHands: 0 | 1 | 2 = actionKind === "touch_both_cheeks" || actionKind === "hands_to_face" ? 2
    : actionKind === "touch_one_cheek" || actionKind === "consume" || actionKind === "pick_up" ? 1
      : 0;

  return {
    schemaVersion: "physical_frame_v1",
    actionKind,
    requiredHands,
    occupiedHandCount: productHeld ? 1 : 0,
    speechMode,
    productState,
    visibleEntityIds: productVisible ? [productId] : [],
    heldEntityIds: productHeld ? [productId] : [],
  };
}

export function repairPhysicalFrameAction(input: {
  productName: string;
  visualAction: string;
  plan: PhysicalFramePlan;
}) {
  if (input.plan.occupiedHandCount === 0 || input.plan.requiredHands < 2) return input.visualAction;
  if (input.plan.actionKind !== "touch_both_cheeks" && input.plan.actionKind !== "hands_to_face") {
    return input.visualAction;
  }
  const product = input.productName.trim() || "продукт";
  return `герой держит ${product} в одной руке, второй рукой касается одной щеки кончиками пальцев`;
}

export function isProductPresentationCue(spokenText: string) {
  return /(?:например|вот\s+(?:этот|это|он)|мой\s+выбор|я\s+выбираю|показываю|for\s+example|this\s+one)/iu.test(spokenText);
}

export function buildProductPresentationAction(productName: string) {
  return buildProductBrollAction(productName);
}

export function buildPhysicalProductDemoStep(input: {
  productName: string;
  frameIndex: number;
  frameCount: number;
}) {
  const product = input.productName.trim() || "продукт";
  return {
    action: buildProductBrollAction(product),
    placement: `${product} стоит на одной устойчивой поверхности; без людей, рук и взаимодействия`,
  };
}

/** Maps a visible run to its local physical sequence so hidden source frames do not cause pickup teleports. */
export function resolveProductDemoFrame(
  visibility: boolean | readonly boolean[] | undefined,
  frameIndex: number,
  frameCount: number,
) {
  const visible = Array.isArray(visibility)
    ? visibility
    : Array.from({ length: frameCount }, () => Boolean(visibility));
  if (!visible[frameIndex]) return null;
  let start = frameIndex;
  let end = frameIndex;
  while (start > 0 && visible[start - 1]) start -= 1;
  while (end + 1 < visible.length && visible[end + 1]) end += 1;
  return { frameIndex: frameIndex - start + 1, frameCount: end - start + 1 };
}

function detectAction(value: string): PhysicalActionKind {
  if (BOTH_CHEEKS_PATTERN.test(value)) return "touch_both_cheeks";
  if (HANDS_TO_FACE_PATTERN.test(value)) return "hands_to_face";
  if (ONE_CHEEK_PATTERN.test(value)) return "touch_one_cheek";
  if (CONSUMPTION_PATTERN.test(value)) return "consume";
  if (DRIVING_PATTERN.test(value)) return "driving";
  if (PICK_UP_PATTERN.test(value)) return "pick_up";
  if (PUT_DOWN_PATTERN.test(value)) return "put_down";
  if (HANDOFF_PATTERN.test(value)) return "handoff";
  if (/говорит|speaks?|talks?|says?/iu.test(value)) return "neutral_speech";
  return "unknown";
}

function classifyProductState(value: string, productName: string): PhysicalObjectState {
  if (HIDDEN_PATTERN.test(value)) return "hidden";
  const mentionsProduct = productName.trim()
    ? value.toLocaleLowerCase().includes(productName.trim().toLocaleLowerCase())
    : PRODUCT_PATTERN.test(value);
  if (!mentionsProduct && !PRODUCT_PATTERN.test(value)) return "unknown";
  if (HOLDING_PATTERN.test(value)) return "held";
  if (SURFACE_PATTERN.test(value)) return "surface";
  return "visible";
}

function mentionsProduct(value: string, productName: string) {
  return value.toLocaleLowerCase().includes(productName.toLocaleLowerCase());
}

function slug(value: string) {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/gu, "");
}
