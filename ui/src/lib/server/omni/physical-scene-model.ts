import type {
  PhysicalActionKind,
  PhysicalFramePlan,
  PhysicalObjectState,
  PhysicalSpeechMode,
} from "../../omni/physical-scene-types";

const CUTAWAY_PATTERN = /cutaway|insert|macro|product close|крупн(?:ый|ом) кадр|перебив|предметн(?:ый|ая) кадр/iu;
const HIDDEN_PATTERN = /(?:вне кадра|не виден|скрыт|hidden|off\s*camera|only thematic objects|только тематические объекты)/iu;
const SURFACE_PATTERN = /(?:на столе|на поверхности|на полке|лежит|стоит|on (?:the )?(?:table|surface|shelf)|resting on)/iu;
const HOLDING_PATTERN = /(?:держит|держать|в руках|holding|holds|in one hand|одной рукой|в одну руку|двумя руками)/iu;
const PRODUCT_PATTERN = /(?:продукт|товар|product|package|упаков|баноч|бутыл|капсул|порош|крем|collagen|коллаген)/iu;
const MULTIPLE_HELD_OBJECTS_PATTERN = /(?:несколько предметов|два предмета|multiple objects|two objects|(?:держит|holding|holds|в руках)[^.;]{0,90}(?: и | and |,\s*))/iu;
const OBJECT_INTERACTION_PATTERN = /(?:держит|держать|в руках|holding|holds|показывает|показать|showing|shows|кус(?:ает|ать|ил)|eat(?:s|ing)?|bite(?:s|ing)?|drink(?:s|ing)?)/iu;
const BOTH_CHEEKS_PATTERN = /(?:обеих?\s+щек|обе\s+щеки|both\s+cheeks)/iu;
const ONE_CHEEK_PATTERN = /(?:одной\s+щек|одну\s+щеку|one\s+cheek)/iu;
const HANDS_TO_FACE_PATTERN = /(?:обе\s+руки\s+(?:у|к)\s+лица|both\s+hands[^.;]{0,30}face)/iu;
const CONSUMPTION_PATTERN = /(?:eat|eating|bite|biting|chew|chewing|drink|drinking|swallow|кус(?:ает|ать|ил)|жует|жуёт|пьет|пьёт|глот(?:ает|ать))/iu;
const DRIVING_PATTERN = /(?:driv|steer|moving car|за рулем|за рулём|ведет машину|ведёт машину|машина едет|автомобиль движется)/iu;
const PICK_UP_PATTERN = /(?:берет|берёт|поднимает|pick\s*up|picks\s*up)/iu;
const PUT_DOWN_PATTERN = /(?:кладет|кладёт|ставит|полож|убирает|откладывает|put\s*down|places?)/iu;
const HANDOFF_PATTERN = /(?:передает|передаёт|handoff|hands?\s+(?:it|the object)\s+to)/iu;

export function hasConsumptionAction(value: string) {
  return CONSUMPTION_PATTERN.test(value);
}

export function hasDrivingAction(value: string) {
  return DRIVING_PATTERN.test(value);
}

export function hasMultipleHeldObjects(value: string) {
  return MULTIPLE_HELD_OBJECTS_PATTERN.test(value);
}

export function normalizeVehicleContext(value: string) {
  return value.replace(DRIVING_PATTERN, "автомобиль припаркован и неподвижен");
}

export function repairReferenceAction(input: {
  action: string;
  spokenText: string;
  productName: string;
  productVisible: boolean;
}) {
  const action = input.action.trim();
  if (!action) return action;
  const hasSpeech = Boolean(input.spokenText.trim());
  const hasDriving = hasDrivingAction(action);
  const hasConsumption = hasConsumptionAction(action);
  const hasMultipleObjects = hasMultipleHeldObjects(action);
  const interactsWithObject = OBJECT_INTERACTION_PATTERN.test(action);
  const product = input.productName.trim() || "продукт";

  if (hasDriving || (input.productVisible && interactsWithObject && !mentionsProduct(action, product))) {
    return input.productVisible
      ? buildProductPresentationAction(product)
      : "герой находится в припаркованной машине, автомобиль неподвижен; герой спокойно говорит в камеру";
  }
  if (hasConsumption && hasSpeech && !CUTAWAY_PATTERN.test(action)) {
    return "герой спокойно говорит в камеру с нейтральным жестом, без еды во рту";
  }
  if (hasMultipleObjects && input.productVisible) {
    return buildProductPresentationAction(product);
  }
  if (interactsWithObject && hasSpeech && !input.productVisible) {
    return "герой показывает только один предмет из текущей реплики одной рукой; остальные предметы вне кадра";
  }
  return action;
}

export function buildPhysicalFramePlan(input: {
  productName: string;
  spokenText: string;
  visualAction: string;
  camera: string;
  productPlacement: string;
}): PhysicalFramePlan {
  const actionText = `${input.visualAction} ${input.productPlacement}`;
  const speechMode: PhysicalSpeechMode = input.spokenText.trim()
    ? CUTAWAY_PATTERN.test(`${input.visualAction} ${input.camera}`) ? "voiceover_only" : "on_camera"
    : "silent";
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
  const product = productName.trim() || "продукт";
  return `герой держит ${product} в одной руке, поворачивает лицевой стороной к камере, второй рукой делает спокойный жест`;
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
