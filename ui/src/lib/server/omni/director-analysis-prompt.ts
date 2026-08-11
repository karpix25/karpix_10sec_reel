import type { DirectorBrief } from "./director-analysis-types";
import { sanitizeCameraStabilizationForPrompt } from "./omni-scene-safety-contract";

export const DIRECTOR_ANALYSIS_PROMPT_VERSION = "director-brief-v5";

export const DIRECTOR_ANALYSIS_SYSTEM_PROMPT = [
  "You are an expert AI video director and UGC cinematographer.",
  "Analyze short-form vertical source videos for reusable visual direction.",
  "Treat visible frames as the factual source of truth: verify the opening, middle, and ending setup before using the transcript. A vehicle cabin, handheld phone shake, visible food, or a passenger seat must never be rewritten as a home or studio.",
  "Return only valid JSON. Do not include markdown, prose, comments, or extra keys.",
  "Do not describe or request application interfaces, social app overlays, buttons, like/share icons, comments, subtitles, captions, progress bars, brand logos, or UI elements.",
  "Focus only on raw footage: subject actions, visual hook, location timeline, atmosphere, clothing style, camera language, lighting, and reusable scene mechanics.",
  "Do not turn the reference speaker's speech tempo or pauses into generation instructions. Do extract visible camera changes, cuts, and transitions exactly as observed, including film burn, light leak, exposure flash, lens flare, blur, wipe, fade, or other edit treatment.",
  "Extract reusable direction without copying the creator identity, face, brand, exact location, logos, protected marks, or platform interface.",
].join("\n");

export function buildDirectorAnalysisUserPrompt(input: { transcript: string }) {
  return [
    "Analyze the attached video and transcript.",
    "Generate a compact director_brief JSON object with exactly these top-level keys:",
    "visual_hook, atmosphere, clothing, location_timeline, camera_timeline, camera, montage_rhythm, action_beats, prop_sources, hand_object_interactions, motion_continuity, reference_action_style, reusable_mechanics, product_introduction.",
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
    "- camera_timeline must cover the whole source video with 2-8 chronological intervals. For each interval record exact seconds, shot type, angle, movement, stabilization, setting, environment, lighting, visible action, and gesture. Preserve raw smartphone texture, handheld shake, focus/exposure changes, and vehicle sway when visible. A moving car is allowed; the presenter is a passenger, never the driver.",
    "- clothing.source names whose outfit style is being described, usually the main presenter.",
    "- clothing.adaptation_notes MUST contain a specific concrete outfit equivalent for the opposite gender body — not a generic instruction like 'adapt gendered garments'. Write what the adapted person would actually wear: name the exact garment (shirt, trousers, dress, etc.), its color matching the original palette, cut (loose, fitted, tailored, etc.), and mood. Example: if source wears a white loose blouse → write 'white loose linen shirt, untucked, same relaxed silhouette and light color'.",
    "- montage_rhythm must describe only visible cuts and transitions. Inspect every boundary between source shots and name the exact treatment: hard cut, jump cut, film burn/light leak, exposure flash, lens flare, blur, wipe, fade, or another visible effect. If the reference stays on one setup, say that it uses a continuous stable shot.",
    "- Do not collapse a film burn, light leak, or exposure flash into a generic 'overlay'; state that it is a brief edit transition between two shots.",
    "- Mention only raw filming choices and human actions.",
    "- All overlays, subtitles, logos, UI cards, and interface elements belong to post-production and must not appear in this JSON.",
    "- product_introduction.first_appearance_sec must be the exact second when the main product first appears physically in frame. If no identifiable product is shown in the reference, set relative_position to 'never' and first_appearance_sec to 0.",
    "- product_introduction.relative_position must be 'hook' if the product appears in the first 20% of the video, 'body' if it appears in the middle 60%, 'payoff' if it appears in the last 20%, or 'never' if no product is shown.",
    "- product_introduction.introduction_style must describe the exact physical action: 'already holding at start', 'placed on table at Xs', 'taken from bag at Xs', 'slides into frame at Xs', 'never shown'. Be specific and include the second.",
    "- product_introduction.naturality_notes must describe how organically the product appears: does the presenter pause to show it, or introduce it mid-sentence without breaking eye contact, etc.",
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
    `- Визуальный монтаж: ${brief.montage_rhythm.transition_style.join(", ") || "непрерывный стабильный кадр без явных переходов"}. Используй только переходы, видимые в соответствующих reference-кадрах; если их нет, сохраняй непрерывный ракурс.`,
    "Используй локацию, окружение, свет, камеру и адаптированную одежду как визуальную основу. Темп речи не копируй.",
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
    `REFERENCE CUT LANGUAGE: ${brief.montage_rhythm.transition_style.join(", ") || "continuous stable shot"}. Use this only where the storyboard reference frames show the same transition; otherwise keep the camera and background continuous.`,
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
    "Adapt this direction to the new person, product, script, and clean raw footage only. Copy the observed visual camera and transition language; do not copy speech tempo.",
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
    camera_timeline: [{
      start_sec: 0,
      end_sec: 0,
      shot_types: [""],
      angles: [""],
      movements: [""],
      stabilization: "",
      setting: "",
      environment: "",
      lighting: "",
      action_description: "",
      actor_gesture: "",
    }],
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
    product_introduction: {
      first_appearance_sec: 0,
      relative_position: "hook|body|payoff|never",
      introduction_style: "already holding at start|placed on table at Xs|taken from bag at Xs|never shown",
      naturality_notes: "describe how organically the product appears without breaking the presenter flow",
    },
  };
}
