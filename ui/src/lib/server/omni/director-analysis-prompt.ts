import type { DirectorBrief } from "./director-analysis-types";
import { sanitizeCameraStabilizationForPrompt } from "./omni-scene-safety-contract";

export const DIRECTOR_ANALYSIS_PROMPT_VERSION = "director-brief-v1";

export const DIRECTOR_ANALYSIS_SYSTEM_PROMPT = [
  "You are an expert AI video director and UGC cinematographer.",
  "Analyze short-form vertical source videos for reusable visual direction.",
  "Return only valid JSON. Do not include markdown, prose, comments, or extra keys.",
  "Do not describe or request application interfaces, social app overlays, buttons, like/share icons, comments, subtitles, captions, progress bars, brand logos, or UI elements.",
  "Focus only on raw footage: subject actions, visual hook, atmosphere, clothing, camera language, lighting, cuts, gestures, and reusable scene mechanics.",
  "Extract reusable direction without copying the creator identity, face, brand, exact location, logos, protected marks, or platform interface.",
].join("\n");

export function buildDirectorAnalysisUserPrompt(input: { transcript: string }) {
  return [
    "Analyze the attached video and transcript.",
    "Generate a compact director_brief JSON object with exactly these top-level keys:",
    "visual_hook, atmosphere, clothing, camera, montage_rhythm, action_beats, reusable_mechanics.",
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
    "- Mention only raw filming choices and human actions.",
    "- All overlays, subtitles, logos, UI cards, and interface elements belong to post-production and must not appear in this JSON.",
  ].join("\n");
}

export function renderDirectorBriefForScriptPrompt(brief: DirectorBrief | null) {
  if (!brief) return "";
  return [
    "Режиссерский анализ оригинального видео:",
    `- Визуальный хук: ${brief.visual_hook.action}; удержание: ${brief.visual_hook.retention_trigger}.`,
    `- Атмосфера: ${brief.atmosphere.mood}; место: ${brief.atmosphere.setting}; свет: ${brief.atmosphere.lighting}.`,
    `- Одежда: ${brief.clothing.style}; палитра: ${brief.clothing.color_palette.join(", ") || "не указана"}.`,
    `- Камера: ${brief.camera.shot_types.join(", ")}; движения: ${brief.camera.movements.join(", ") || "минимальные"}.`,
    `- Монтаж: ${brief.montage_rhythm.cut_pace}; переходы: ${brief.montage_rhythm.transition_style.join(", ") || "простые склейки"}.`,
    `- Механика: ${brief.reusable_mechanics.visual_mechanics.join("; ")}.`,
    "Используй это как режиссуру и атмосферу для нового сценария, но не копируй личность автора, бренд, логотипы, интерфейсы и точную сцену.",
  ].join("\n");
}

export function renderDirectorBriefForOmniPrompt(brief: DirectorBrief | null) {
  if (!brief) return null;
  const firstBeats = brief.action_beats
    .slice(0, 4)
    .map((beat) => `${beat.timestamp_sec}s: ${beat.action_description}; ${beat.actor_gesture}`)
    .join(" | ");
  return [
    `REFERENCE DIRECTION: visual hook - ${brief.visual_hook.action}; retention trigger - ${brief.visual_hook.retention_trigger}.`,
    `ATMOSPHERE: ${brief.atmosphere.mood}; ${brief.atmosphere.setting}; ${brief.atmosphere.lighting}; ${brief.atmosphere.color_grading}.`,
    `WARDROBE: ${brief.clothing.style}; ${brief.clothing.fit_details}; colors: ${brief.clothing.color_palette.join(", ") || "natural neutral palette"}.`,
    `CAMERA: ${brief.camera.shot_types.join(", ")}; angles: ${brief.camera.angles.join(", ")}; movement: ${brief.camera.movements.join(", ")}; ${sanitizeCameraStabilizationForPrompt(brief.camera.stabilization)}.`,
    `EDITING: ${brief.montage_rhythm.cut_pace}; ${brief.montage_rhythm.beat_sync}; transitions: ${brief.montage_rhythm.transition_style.join(", ") || "clean jump cuts"}.`,
    firstBeats ? `ACTION DNA: ${firstBeats}.` : "",
    `REUSABLE MECHANICS: ${brief.reusable_mechanics.visual_mechanics.join("; ")}; loop pattern: ${brief.reusable_mechanics.looping_pattern}.`,
    "Adapt this direction to the new person, product, script, and clean raw footage only.",
  ].filter(Boolean).join("\n");
}

function buildDirectorBriefSkeleton() {
  return {
    visual_hook: { action: "", retention_trigger: "" },
    atmosphere: { mood: "", lighting: "", color_grading: "", setting: "" },
    clothing: { style: "", color_palette: [""], fit_details: "" },
    camera: { shot_types: [""], angles: [""], movements: [""], stabilization: "" },
    montage_rhythm: { cut_pace: "", beat_sync: "", transition_style: [""] },
    action_beats: [{ timestamp_sec: 0, action_description: "", actor_gesture: "" }],
    reusable_mechanics: {
      visual_mechanics: [""],
      safe_zones_for_elements: "",
      looping_pattern: "",
    },
  };
}
