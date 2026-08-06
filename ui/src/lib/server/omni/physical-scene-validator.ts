import type { OmniSegmentCreativePlan, OmniPromptValidationResult } from "../../omni/creative-contract";
import type {
  OmniStoryboardFrame,
  OmniStoryboardSegment,
} from "../../omni/storyboard/omni-storyboard-types";
import type { OmniStoryboardPlanSource } from "../../omni/types";
import { buildPhysicalFramePlan } from "./physical-scene-model";

type PhysicalFrameState = "hidden" | "surface" | "held" | "visible" | "unknown";

const CUTAWAY_PATTERN = /cutaway|insert|macro|product close|крупн(?:ый|ом) кадр|перебив|предметн(?:ый|ая) кадр/iu;
const CONSUMPTION_PATTERN = /(?:eat|eating|bite|biting|chew|chewing|drink|drinking|swallow|кус(?:ает|ать|ил)|жеван|жует|жуёт|пьет|пьёт|глот(?:ает|ать))/iu;
const DRIVING_PATTERN = /(?:driv|steer|moving car|за рулем|за рулём|ведет машину|ведёт машину|машина едет|автомобиль движется)/iu;
const HOLDING_PATTERN = /(?:держит|держать|в руках|holding|holds|in one hand|одной рукой|двумя руками)/iu;
const MULTI_OBJECT_PATTERN = /(?:несколько предметов|два предмета|multiple objects|two objects|(?:держит|holding|holds|в руках)[^.;]{0,90}(?: и | and |,\s*))/iu;
const TRANSITION_PATTERN = /(?:полож|ставит|кладет|кладёт|убирает|откладывает|берет|берёт|поднимает|замен|переклад|cut|transition|смен)/iu;
const HIDDEN_PATTERN = /(?:вне кадра|не виден|скрыт|hidden|off\s*camera|only thematic objects|только тематические объекты)/iu;

const OBJECT_CUES: readonly [string, RegExp][] = [
  ["cheese", /сыр|cheese/iu],
  ["carrot", /морков|carrot/iu],
  ["snack", /перекус|снек|snack/iu],
  ["food", /еда|пищ|food|meal/iu],
  ["fruit", /яблок|банан|фрукт|apple|banana|fruit/iu],
  ["drink", /напит|вода|кофе|чай|drink|water|coffee|tea/iu],
  ["container", /баноч|бутыл|упаков|контейнер|jar|bottle|package|container/iu],
  ["cosmetic", /крем|сыворот|пенк|маск|cream|serum|foam|mask/iu],
];

const PHYSICAL_REPAIR_CONTRACT =
  "PHYSICAL CONTINUITY REPAIR: each visible object keeps one identity and one physical state; put an object down before picking up another; never show eating, drinking, chewing, or biting during on-camera speech; use voiceover-only during consumption; every handoff or replacement must be visible and physically motivated; a vehicle scene is parked unless the scene explicitly requires driving action.";

export function validatePhysicalScene(input: {
  storyboard: OmniStoryboardSegment | null;
  creativePlan: OmniSegmentCreativePlan | null;
  productName: string;
}): OmniPromptValidationResult {
  if (!input.storyboard?.frames?.length) {
    return result(["physical_scene_plan_required"], []);
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const states: PhysicalFrameState[] = [];

  input.storyboard.frames.forEach((frame, index) => {
    const frameNumber = index + 1;
    const text = frameText(frame);
    const actionText = frameActionText(frame);
    const spoken = frame.spokenText.trim();
    const onCamera = Boolean(spoken) && !CUTAWAY_PATTERN.test(`${frame.visualAction} ${frame.camera}`);
    const placementVisible = !HIDDEN_PATTERN.test(frame.productPlacement);
    const spokenObjects = objectCues(spoken);
    const visualObjects = objectCues(`${frame.visualAction} ${frame.productPlacement}`);
    const physicalPlan = frame.physicalPlan || buildPhysicalFramePlan({
      productName: input.productName,
      spokenText: frame.spokenText,
      visualAction: frame.visualAction,
      camera: frame.camera,
      productPlacement: frame.productPlacement,
    });
    const currentState = physicalPlan.productState;
    const productVisible = physicalPlan.visibleEntityIds.length > 0;
    states.push(currentState);

    if (physicalPlan.requiredHands + physicalPlan.occupiedHandCount > 2) {
      errors.push(`frame_${frameNumber}_hand_capacity_conflict`);
    }
    if ((physicalPlan.productState === "unknown" || physicalPlan.productState === "visible") && productVisible) {
      errors.push(`frame_${frameNumber}_product_support_is_ambiguous`);
    }

    if (onCamera && CONSUMPTION_PATTERN.test(actionText)) {
      errors.push(`frame_${frameNumber}_speech_during_consumption`);
    }
    if (DRIVING_PATTERN.test(`${frame.environment} ${frame.visualAction} ${frame.camera}`)) {
      errors.push(`frame_${frameNumber}_driving_action_in_scene`);
    }
    if (HOLDING_PATTERN.test(text) && MULTI_OBJECT_PATTERN.test(text)) {
      errors.push(`frame_${frameNumber}_multiple_held_objects`);
    }
    if (placementVisible && spokenObjects.size && visualObjects.size && !hasIntersection(spokenObjects, visualObjects)) {
      errors.push(`frame_${frameNumber}_object_identity_mismatch`);
    } else if (placementVisible && spokenObjects.size && !visualObjects.size && !mentionsProduct(spoken, input.productName)) {
      warnings.push(`frame_${frameNumber}_spoken_object_needs_visual_mapping`);
    }
  });

  for (let index = 1; index < states.length; index += 1) {
    const previous = states[index - 1];
    const current = states[index];
    if (previous === current || previous === "hidden" || current === "hidden") continue;
    const transitionText = frameText(input.storyboard.frames[index]);
    if (!TRANSITION_PATTERN.test(transitionText)) {
      warnings.push(`frame_${index + 1}_object_state_change_without_transition`);
    }
  }

  if (input.creativePlan?.beats.some((beat) => CONSUMPTION_PATTERN.test(beat.action)) &&
      input.storyboard.frames.some((frame) => Boolean(frame.spokenText.trim()) && !CUTAWAY_PATTERN.test(frame.visualAction))) {
    warnings.push("scene_contains_consumption_beat_and_on_camera_speech");
  }

  return result(errors, warnings);
}

export function repairPhysicalScenePrompt(prompt: string, validation: OmniPromptValidationResult) {
  if (validation.valid && !validation.warnings.length) return prompt;
  if (prompt.includes("PHYSICAL CONTINUITY REPAIR:")) return prompt;
  return `${prompt}\n\n${PHYSICAL_REPAIR_CONTRACT}`;
}

export function assertPhysicalPromptPlan(
  promptPlan: readonly { index: number; validation: OmniPromptValidationResult }[]
) {
  const failures = promptPlan.filter((segment) => !segment.validation.valid);
  if (!failures.length) return;
  throw new Error(`Omni physical storyboard preflight blocked: ${failures
    .map((segment) => `segment ${segment.index}: ${segment.validation.errors.join(", ")}`)
    .join("; ")}`);
}

export function normalizeStoryboardSource(input: {
  source: OmniStoryboardPlanSource | null | undefined;
  segmentIndex: number;
  durationSeconds: number;
  voiceoverText: string;
  productName: string;
}): OmniStoryboardSegment | null {
  const frames = extractFrames(input.source);
  if (!frames.length) return null;
  return {
    segmentIndex: input.segmentIndex,
    durationSeconds: input.durationSeconds,
    voiceoverText: input.voiceoverText,
    frames: frames.map((frame) => {
      const normalizedFrame: OmniStoryboardFrame = {
        spokenText: readText(frame, "spokenText", "spoken_text", "spokenWords", "spoken_words"),
        visualAction: readText(frame, "visualAction", "visual_action", "action"),
        camera: readText(frame, "camera", "cameraAngle", "camera_angle"),
        environment: readText(frame, "environment"),
        wardrobe: readText(frame, "wardrobe"),
        productPlacement: readText(frame, "productPlacement", "product_placement"),
        sfxNotes: readText(frame, "sfxNotes", "sfx_notes", "sfx"),
        effectNotes: readOptionalText(frame, "effectNotes", "effect_notes", "effects"),
      };
      return {
        ...normalizedFrame,
        physicalPlan: buildPhysicalFramePlan({
          productName: input.productName,
          spokenText: normalizedFrame.spokenText,
          visualAction: normalizedFrame.visualAction,
          camera: normalizedFrame.camera,
          productPlacement: normalizedFrame.productPlacement,
        }),
      };
    }),
  };
}

function extractFrames(source: OmniStoryboardPlanSource | null | undefined): readonly Record<string, unknown>[] {
  if (Array.isArray(source)) return source as readonly Record<string, unknown>[];
  if (!source || typeof source !== "object") return [];
  const value = source as Record<string, unknown>;
  if (Array.isArray(value.frames)) return value.frames as readonly Record<string, unknown>[];
  if (Array.isArray(value.storyboardFrames)) return value.storyboardFrames as readonly Record<string, unknown>[];
  if (Array.isArray(value.storyboard_frames)) return value.storyboard_frames as readonly Record<string, unknown>[];
  return [];
}

function frameText(frame: OmniStoryboardFrame) {
  return [frame.visualAction, frame.productPlacement, frame.sfxNotes, frame.effectNotes || ""].join(" ");
}

function frameActionText(frame: OmniStoryboardFrame) {
  return [frame.visualAction, frame.sfxNotes, frame.effectNotes || ""].join(" ");
}

function objectCues(value: string) {
  return new Set(OBJECT_CUES.filter(([, pattern]) => pattern.test(value)).map(([name]) => name));
}

function hasIntersection(left: Set<string>, right: Set<string>) {
  return [...left].some((value) => right.has(value));
}

function mentionsProduct(value: string, productName: string) {
  const normalizedProduct = productName.trim();
  return Boolean(normalizedProduct && value.toLocaleLowerCase().includes(normalizedProduct.toLocaleLowerCase()));
}

function readText(frame: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (typeof frame[key] === "string") return frame[key] as string;
  }
  return "";
}

function readOptionalText(frame: Record<string, unknown>, ...keys: string[]) {
  const value = readText(frame, ...keys);
  return value || null;
}

function result(errors: string[], warnings: string[]): OmniPromptValidationResult {
  return {
    valid: errors.length === 0,
    score: Math.max(0, 100 - errors.length * 25 - warnings.length * 8),
    errors,
    warnings,
  };
}
