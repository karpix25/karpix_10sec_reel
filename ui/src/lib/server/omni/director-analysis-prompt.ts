import type { DirectorBrief } from "./director-analysis-types";
import { sanitizeCameraStabilizationForPrompt } from "./omni-scene-safety-contract";

export const DIRECTOR_ANALYSIS_PROMPT_VERSION = "director-brief-v3";

export const DIRECTOR_ANALYSIS_SYSTEM_PROMPT = [
  "You are an expert AI video director and UGC cinematographer.",
  "Analyze short-form vertical source videos for reusable visual direction.",
  "Return only valid JSON. Do not include markdown, prose, comments, or extra keys.",
  "Do not describe or request application interfaces, social app overlays, buttons, like/share icons, comments, subtitles, captions, progress bars, brand logos, or UI elements.",
  "Focus only on raw footage: subject actions, visual hook, location timeline, atmosphere, clothing style, camera language, lighting, and reusable scene mechanics.",
  "Do not turn the reference speaker's speech tempo, pauses, or edit rhythm into generation instructions.",
  "Extract reusable direction without copying the creator identity, face, brand, exact location, logos, protected marks, or platform interface.",
].join("\n");

export function buildDirectorAnalysisUserPrompt(input: { transcript: string }) {
  return [
    "Analyze the attached video and transcript.",
    "Generate a compact director_brief JSON object with exactly these top-level keys:",
    "visual_hook, atmosphere, clothing, location_timeline, camera, montage_rhythm, action_beats, prop_sources, hand_object_interactions, motion_continuity, reference_action_style, reusable_mechanics.",
    "",
    "Required JSON shape:",
    JSON.stringify(buildDirectorBriefSkeleton(), null, 2),
    "",
    "Transcript:",
    '"""',
    input.transcript.trim() || "No transcript provided.",
    '"""',
    "",
    "Important constraints:",
    "- Values must be descriptive but compact.",
    "- location_timeline must describe any location/environment changes by seconds. If the location never changes, return one item for the whole video.",
    "- clothing.source names whose outfit style is being described, usually the main presenter.",
    "- clothing.adaptation_notes must explain how to adapt the outfit style to a different avatar gender/body while keeping color, formality, layer, and mood.",
    "- montage_rhythm is analysis only. Do not write it as something the new video must copy.",
    "- Mention only raw filming choices and human actions.",
    "- All overlays, subtitles, logos, UI cards, and interface elements belong to post-production and must not appear in this JSON.",
  ].join("\n");
}

export function renderDirectorBriefForScriptPrompt(brief: DirectorBrief | null) {
  if (!brief) return "";
  const handObjectInteractions = brief.hand_object_interactions || [];
  const motionContinuity = brief.motion_continuity || [];
  return [
    "Режиссерский анализ оригинального видео:",
    `- Визуальный хук: ${brief.visual_hook.action}; удержание: ${brief.visual_hook.retention_trigger}.`,
    `- Атмосфера: ${brief.atmosphere.mood}; место: ${brief.atmosphere.setting}; свет: ${brief.atmosphere.lighting}.`,
    `- Одежда: ${brief.clothing.style}; палитра: ${brief.clothing.color_palette.join(", ") || "не указана"}.`,
    `- Камера: ${brief.camera.shot_types.join(", ")}; движения: ${brief.camera.movements.join(", ") || "минимальные"}.`,
    brief.location_timeline?.length
      ? `- Локации по таймлайну: ${brief.location_timeline.map((item) => `${item.start_sec}-${item.end_sec}s ${item.setting || item.environment}`).join("; ")}.`
      : "",
    handObjectInteractions.length
      ? `- Руки и предметы: ${handObjectInteractions.join("; ")}.`
      : "",
    motionContinuity.length ? `- Физика движения: ${motionContinuity.join("; ")}.` : "",
    `- Механика: ${brief.reusable_mechanics.visual_mechanics.join("; ")}.`,
    "Используй локацию, окружение, свет, камеру и адаптированную одежду как визуальную основу. Темп речи и монтаж оригинала не копируй.",
  ].join("\n");
}

export function renderDirectorBriefForOmniPrompt(brief: DirectorBrief | null) {
  if (!brief) return null;
  const handObjectInteractions = brief.hand_object_interactions || [];
  const motionContinuity = brief.motion_continuity || [];
  const firstBeats = brief.action_beats
    .slice(0, 4)
    .map((beat) => `${beat.timestamp_sec}s: ${beat.action_description}; ${beat.actor_gesture}`)
    .join(" | ");
  return [
    `REFERENCE DIRECTION: visual hook - ${brief.visual_hook.action}; retention trigger - ${brief.visual_hook.retention_trigger}.`,
    `ATMOSPHERE: ${brief.atmosphere.mood}; ${brief.atmosphere.setting}; ${brief.atmosphere.lighting}; ${brief.atmosphere.color_grading}.`,
    `WARDROBE: ${brief.clothing.style}; ${brief.clothing.fit_details}; colors: ${brief.clothing.color_palette.join(", ") || "natural neutral palette"}; source: ${brief.clothing.source}.`,
    `CAMERA: ${brief.camera.shot_types.join(", ")}; angles: ${brief.camera.angles.join(", ")}; movement: ${brief.camera.movements.join(", ")}; ${sanitizeCameraStabilizationForPrompt(brief.camera.stabilization)}.`,
    brief.location_timeline?.length
      ? `LOCATION TIMELINE: ${brief.location_timeline.map((item) => `${item.start_sec}-${item.end_sec}s ${item.setting}; ${item.environment}; ${item.lighting}`).join(" | ")}.`
      : "",
    firstBeats ? `ACTION DNA: ${firstBeats}.` : "",
    handObjectInteractions.length
      ? `HAND-PROP DNA: ${handObjectInteractions.slice(0, 3).join("; ")}.`
      : "",
    motionContinuity.length
      ? `MOTION CONTINUITY: ${motionContinuity.slice(0, 3).join("; ")}.`
      : "",
    brief.reference_action_style ? `ACTION STYLE: ${brief.reference_action_style}.` : "",
    `REUSABLE MECHANICS: ${brief.reusable_mechanics.visual_mechanics.join("; ")}; loop pattern: ${brief.reusable_mechanics.looping_pattern}.`,
    "Adapt this direction to the new person, product, script, and clean raw footage only. Do not copy the reference speech tempo or edit rhythm.",
  ].filter(Boolean).join("\n");
}

function buildDirectorBriefSkeleton() {
  return {
    visual_hook: { action: "", retention_trigger: "" },
    atmosphere: { mood: "", lighting: "", color_grading: "", setting: "" },
    clothing: {
      style: "",
      color_palette: [""],
      fit_details: "",
      source: "main presenter",
      adaptation_notes: "adapt gendered garments to the avatar gender/body while keeping color, formality, layer, and mood",
    },
    location_timeline: [{ start_sec: 0, end_sec: 0, setting: "", environment: "", lighting: "" }],
    camera: { shot_types: [""], angles: [""], movements: [""], stabilization: "" },
    montage_rhythm: { cut_pace: "", beat_sync: "", transition_style: [""] },
    action_beats: [{ timestamp_sec: 0, action_description: "", actor_gesture: "" }],
    prop_sources: ["where visible objects physically start: already on table, in hand, from bag, from shelf"],
    hand_object_interactions: ["specific hand contact with objects: pick up, slide, rotate, place down"],
    motion_continuity: ["how objects preserve position, scale, gravity, shadows, and cause-effect between beats"],
    reference_action_style: "talking head, product demo, routine action, cutaway insert, unboxing, comparison, or other reusable format",
    reusable_mechanics: {
      visual_mechanics: [""],
      safe_zones_for_elements: "",
      looping_pattern: "",
    },
  };
}
