import type { OmniProduct } from "@/lib/omni/types";

export type VisualWorld = {
  name: string;
  category: string;
  setting: string;
  hook: string;
  actions: string[];
  cameraStyle: string;
};

type VisualWorldCandidate = VisualWorld & {
  keywords: RegExp;
};

const VISUAL_WORLDS: VisualWorldCandidate[] = [
  {
    name: "travel_payment_lobby",
    category: "travel_payment",
    keywords: /путеше|отел|аэропорт|тур|страхов|карта|оплат|банк|деньги/,
    setting: "a real travel/payment moment: suitcase, phone booking screen without readable UI, cafe counter, hotel lobby, airport corner, or city street",
    hook: "extreme close-up of a phone or receipt pushed near the lens, suitcase in the background, then a fast move to the blogger's face",
    cameraStyle: "phone footage can be handheld, resting on luggage, propped on a cafe table, or filmed by a friend walking nearby",
    actions: [
      "walk-and-talk with a phone in hand through a real travel setting",
      "over-the-shoulder phone detail, then a quick return to selfie framing",
      "hands place a neutral card or phone beside travel objects, then the blogger reacts naturally",
    ],
  },
  {
    name: "beauty_health_bathroom_mirror",
    category: "beauty_health",
    keywords: /кожа|волос|коллаген|крем|сыворот|бады|здоров|витамин|тело/,
    setting: "a real bathroom or vanity routine: mirror, sink, shelf, glass of water, towel, soft morning light",
    hook: "mirror extreme close-up: the blogger snaps a glass, spoon, shelf detail, or hand gesture into frame before revealing their face in reflection",
    cameraStyle: "phone footage can be a mirror angle, a phone resting on the sink, a small tripod on the shelf, or a close side angle filmed by another person",
    actions: [
      "mirror selfie angle with a quick rack focus from a routine object to face",
      "stationary sink-shelf angle, then a natural lean-in to direct eye contact",
      "close-up of hands starting the routine, then a natural selfie reaction",
    ],
  },
  {
    name: "beauty_health_kitchen_counter",
    category: "beauty_health",
    keywords: /кожа|волос|коллаген|крем|сыворот|бады|здоров|витамин|тело/,
    setting: "a lived-in morning kitchen counter: kettle, mug, glass, spoon, cabinet, imperfect daylight, no studio look",
    hook: "low counter close-up: a glass or spoon slides into frame, then the presenter leans into the shot from behind the counter",
    cameraStyle: "phone footage can be propped against a mug, resting on the counter, handheld for a quick face beat, or filmed by someone across the table",
    actions: [
      "phone rests on the counter while both hands arrange a glass and spoon, then the presenter leans in to talk",
      "side angle past a mug or kettle to the presenter speaking naturally",
      "short locked-off countertop shot, then a quick face reaction from the same spot",
    ],
  },
  {
    name: "beauty_health_bedroom_shelf",
    category: "beauty_health",
    keywords: /кожа|волос|коллаген|крем|сыворот|бады|здоров|витамин|тело/,
    setting: "a casual bedroom or wardrobe shelf routine: mirror, robe or cardigan, bedside table, water glass, daylight from a window",
    hook: "phone is already propped on a shelf as the presenter steps into frame with a quick routine object gesture near the lens",
    cameraStyle: "phone footage can be locked on a shelf, placed near the mirror, handheld briefly, or filmed from the doorway by another person",
    actions: [
      "presenter steps into a propped-phone frame and adjusts a glass on the shelf",
      "mirror-side shot with the presenter speaking while one hand gestures naturally",
      "close-up of shelf details, then a soft return to the presenter's face in the same room",
    ],
  },
  {
    name: "fitness_gym_corner",
    category: "fitness",
    keywords: /трен|спорт|зал|мышц|сустав|бег|калор|упражн|фитнес/,
    setting: "a real fitness moment: gym corner, home mat, locker room, sports bag, towel, water bottle",
    hook: "low handheld shot from floor level as a shoe, bottle, or bag lands close to the lens, then camera lifts to the blogger",
    cameraStyle: "phone footage can be handheld after movement, propped on a gym bag, set on the floor, or filmed by a training partner",
    actions: [
      "camera rises from a workout detail to a breathing selfie shot",
      "sports bag or bottle crosses the foreground as a natural wipe",
      "walking handheld shot after movement, with a quick glance into camera",
    ],
  },
  {
    name: "education_work_desk",
    category: "education_work",
    keywords: /курс|учеб|работ|офис|план|задач|ноутбук|документ|бизнес/,
    setting: "a lived-in work or learning desk: laptop, notebook, sticky notes, phone, desk lamp, imperfect background",
    hook: "top-down close-up of a hand crossing out a note or sliding a laptop, then whip-pan to the blogger's face",
    cameraStyle: "phone footage can be top-down on the desk, propped against a laptop, handheld for a quick face beat, or filmed by someone over the shoulder",
    actions: [
      "top-down desk detail shifts into over-the-shoulder framing",
      "hand points to a notebook or neutral screen, then returns to selfie",
      "slow push-in from desk clutter to the blogger explaining the next beat",
    ],
  },
  {
    name: "food_home_counter",
    category: "food_home",
    keywords: /еда|кофе|завтрак|кухн|рецепт|вкус|напит|стакан/,
    setting: "a non-sterile home kitchen or dining table: cup, spoon, glass, counter, package, everyday daylight",
    hook: "macro close-up of a cup, spoon, glass, or counter detail entering frame fast, then the camera pulls back to the blogger",
    cameraStyle: "phone footage can be propped on the counter, resting near a mug, handheld for a short selfie, or filmed by another person at the table",
    actions: [
      "close-up hands on the counter, then handheld move into selfie",
      "cup or object crosses the foreground as a wipe to the blogger",
      "side angle through a table object, then a quick push-in to the face",
    ],
  },
  {
    name: "street_ugc_native",
    category: "street_ugc",
    keywords: /.*/,
    setting: "a native creator scene outside a studio: hallway, elevator, car, street, shop aisle, stairwell, or lived-in room",
    hook: "camera already moving as the blogger enters frame with a sudden close-up gesture or object near the lens",
    cameraStyle: "phone footage can be handheld, propped on a ledge, placed inside a car, or filmed by a friend nearby",
    actions: [
      "walk-and-talk handheld shot with a slightly chaotic real background",
      "fast shift from object close-up to direct selfie eye contact",
      "short whip-pan to a scene detail and back while the blogger keeps talking",
    ],
  },
];

export const OMNI_MOBILE_UGC_STYLE = [
  "Natural vertical smartphone UGC video.",
  "Shot like a real creator filmed it on a phone, not like a polished commercial.",
  "Phone-shot coverage may be handheld, propped on furniture, set on a small tripod, or filmed by another person.",
  "Natural available light, realistic skin texture, imperfect real-world background.",
  "A fictional UGC presenter with a consistent general type appears throughout the reel.",
  "Use the avatar reference as a loose character moodboard for a privacy-safe fictional presenter.",
  "Keep the presenter's general type, outfit color palette, mood, and speaking style consistent in every segment.",
  "Each 10-second segment needs a fresh directed shot, angle, or physical action so the reel does not look repetitive.",
  "The first 3 seconds of the first segment must be a visual pattern interrupt, not a greeting or static talking head.",
  "The product or offer must feel native to the creator's real environment.",
].join("\n");

export function buildReelVisualWorld(script: string, product: OmniProduct): VisualWorld {
  const normalized = `${script} ${product.name} ${product.description || ""} ${product.product_reference_notes || ""}`
    .toLowerCase()
    .replace(/ё/g, "е");
  const matches = VISUAL_WORLDS.filter((world) => world.category !== "street_ugc" && world.keywords.test(normalized));
  const candidates = matches.length ? matches : VISUAL_WORLDS.filter((world) => world.category === "street_ugc");
  return stripKeywords(candidates[stableHash(normalized) % candidates.length]);
}

export function buildSegmentContinuityLine(segmentIndex: number, segmentCount: number, visualWorld: VisualWorld) {
  return `This is part ${segmentIndex}/${segmentCount} of one continuous UGC video. In part 1, use this exact physical location and keep that same location, presenter, outfit palette, lighting family, background logic, and phone-camera style in every segment: ${visualWorld.setting}. Continue the same reel; do not restart with a new intro, new room, new street, or unrelated scene.`;
}

export function buildSegmentStoryGoal(segmentIndex: number, segmentCount: number, visualWorld: VisualWorld) {
  if (segmentIndex === 1) {
    return `Open with a visually unusual first-3-second hook inside one exact physical location from this world: ${visualWorld.setting}. Create motion immediately, then move into the spoken point.`;
  }
  if (segmentIndex === segmentCount) {
    return "Close with a clear payoff or CTA-friendly moment that feels like the same creator finishing the same reel, not a new ad scene.";
  }
  return "Develop the scenario with one new physical beat, camera angle, foreground object, or camera movement while keeping the same exact location, presenter, lighting, and visual world.";
}

export function buildSegmentShotPlan(segmentIndex: number, segmentCount: number, visualWorld: VisualWorld) {
  const action = visualWorld.actions[(segmentIndex - 1) % visualWorld.actions.length];
  if (segmentIndex === 1) {
    return [
      `0-3s: visual pattern interrupt hook — ${visualWorld.hook}. Start in motion immediately; no greeting, logo, static face, or clean ad intro.`,
      `3-7s: move into a believable phone-shot angle while the blogger starts the line naturally. ${visualWorld.cameraStyle}.`,
      "7-10s: end mid-motion with a stitch-friendly beat that can continue into the next segment.",
    ].join("\n");
  }

  if (segmentIndex === segmentCount) {
    return [
      `0-3s: continue the same scene with a new angle — ${action}.`,
      `3-7s: return to direct camera address with natural expression in the same exact location. ${visualWorld.cameraStyle}.`,
      "7-10s: finish with a relaxed CTA/payoff gesture, same location and light, no hard reset.",
    ].join("\n");
  }

  return [
    `0-3s: continue without intro using a fresh directed action — ${action}.`,
    `3-7s: keep the blogger speaking while changing composition inside the same exact location. ${visualWorld.cameraStyle}.`,
    "7-10s: land on a different detail or reaction than the previous segment so every part has its own shot identity without changing the scene.",
  ].join("\n");
}

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function stripKeywords(world: VisualWorldCandidate): VisualWorld {
  return {
    name: world.name,
    category: world.category,
    setting: world.setting,
    hook: world.hook,
    actions: world.actions,
    cameraStyle: world.cameraStyle,
  };
}
