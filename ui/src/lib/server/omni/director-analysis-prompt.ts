import type { DirectorBrief } from "./director-analysis-types";
import { sanitizeCameraStabilizationForPrompt } from "./omni-scene-safety-contract";
import { renderReferenceSceneModeForDirectorPrompt, resolveReferenceSceneMode } from "./omni-reference-scene-mode";
import { renderVisibleSubjectPolicy, resolveDirectorVisibleSubjectPolicy } from "./director-visibility-policy";
import { renderReferenceFormatContract, resolveReferenceFormatMode } from "./omni-reference-format-mode";

export const DIRECTOR_ANALYSIS_PROMPT_VERSION = "director-brief-v13-wardrobe-timeline";

export const DIRECTOR_ANALYSIS_SYSTEM_PROMPT = [
  "You are an expert AI video director and UGC cinematographer.",
  "Analyze short-form vertical source videos for reusable visual direction.",
  "Treat visible frames as the factual source of truth: verify the opening, middle, and ending setup before using the transcript. A vehicle cabin, handheld phone shake, visible food, or a passenger seat must never be rewritten as a home or studio.",
  "Return only valid JSON. Do not include markdown, prose, comments, or extra keys.",
  "Do not describe or request application interfaces, social app overlays, buttons, like/share icons, comments, subtitles, captions, progress bars, brand logos, or UI elements.",
  "Focus only on raw footage: subject actions, visual hook, location timeline, atmosphere, clothing style, camera language, lighting, reusable scene mechanics, and the audible music layer.",
  "Listen to the attached video's audio when supported. Distinguish spoken voice, background music, natural production sound, and sound effects. Do not confuse speech or ambient noise with music.",
  "Do not turn the reference speaker's speech tempo or pauses into generation instructions. Do extract visible camera changes, cuts, and transitions exactly as observed, including film burn, light leak, exposure flash, lens flare, blur, wipe, fade, or other edit treatment.",
  "Extract reusable direction without copying the creator identity, face, brand, exact location, logos, protected marks, or platform interface.",
].join("\n");

export function buildDirectorAnalysisUserPrompt(input: { transcript: string }) {
  return [
    "Analyze the attached video and transcript.",
    "Generate a compact director_brief JSON object with exactly these top-level keys:",
    "reference_subject_mode, visible_subject_policy, reference_format_mode, reference_render_mode, reference_motion_mode, audio_profile, wardrobe_continuity, subject_continuity, wardrobe_timeline, visual_hook, atmosphere, clothing, location_timeline, camera_timeline, camera, montage_rhythm, action_beats, prop_sources, hand_object_interactions, motion_continuity, reference_action_style, reusable_mechanics, product_introduction, visual_transfer.",
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
    "- reference_subject_mode MUST be classified from visible frames and narration, not transcript alone: presenter, voiceover_broll, faceless_hands, body_crop, or object_only. Use voiceover_broll when the meaning is carried by off-camera voiceover over independent B-roll cutaways; the saved avatar may remain the silent visual protagonist, but there is no stable talking-head performance. Use faceless_hands only when only hands/props are visible; never invent a face or avatar.",
    "- visible_subject_policy MUST be classified from visible frames: presenter when a person speaks to camera, silent_avatar when the same person appears but narration is off-camera, no_people when no person or hands are visible, hands_only when only hands/body crop are visible, object_only when only an object or surface is visible, and animation when the source is illustrated or animated. Never choose silent_avatar for a reference that contains no person.",
    "- reference_format_mode MUST be classified from the visible edit and narration: continuous_story when one scene and physical state continue between segments; voiceover_montage when one narrator carries the meaning across independent cutaways where location, action, camera setup, or outfit can change while the main presenter remains the same.",
    "- reference_render_mode MUST be classified from the actual visual production: talking_head, voiceover_broll, fast_montage, object_hands, animation, or mixed. Choose animation for cartoon, anime, illustrated, stop-motion, 2D, or 3D visual production; choose mixed when the source changes production mode between scenes.",
    "- reference_motion_mode MUST describe how the new segment should be produced: continuous_motion, montage, or animated_still. This is a visual production classification, not a guess from the transcript.",
    "- wardrobe_continuity MUST be observed from the video independently of reference_format_mode: stable when the same visible subject keeps the same outfit; changes_between_cuts when the outfit visibly changes between source cuts or intervals; not_visible when no clothing is visible; unknown only when the video does not provide enough evidence.",
    "- subject_continuity MUST describe whether the visible subject is one recurring person, multiple different people, absent, or unclear: single_subject, multiple_subjects, no_visible_subject, or unknown. Never infer identity continuity from voiceover montage alone.",
    "- wardrobe_timeline MUST contain 1-8 chronological intervals covering the source video. For every interval record start_sec, end_sec, subject_id, visible, description, change_note, and confidence. Inspect each cut: do not copy one global outfit into all intervals. If different people appear, use different subject_id values. If clothing is not visible, set visible=false and leave description empty.",
    "- audio_profile MUST classify the actual reference audio. Set music_present to true only when a non-diegetic or clearly musical layer is audible; set it to false for speech, silence, room tone, traffic, handling noise, and isolated natural SFX. Return music_role as none, background_bed, rhythmic_edit_driver, emotional_accent, or unknown; mood as energetic, calm, dramatic, inspiring, playful, or serious; energy as low, medium, high, or unknown; tempo as slow, medium, fast, or unknown; voice_priority as low, medium, high, or unknown; confidence as a number from 0 to 1; and evidence as one short factual sentence. If the audio is unclear, lower confidence and do not claim music is present.",
    "- location_timeline must describe any location/environment changes by seconds. If the location never changes, return one item for the whole video.",
    "- camera_timeline must cover the whole source video with 2-8 chronological intervals. For each interval record exact seconds, shot type, angle, movement, stabilization, setting, environment, lighting, visible action, gesture, and speech_mode. Set speech_mode to on_camera when the visible person is speaking/lip-syncing to camera, voiceover_only when narration continues over an independent B-roll/cutaway, or silent when nobody speaks. This is per interval: a hybrid reference may alternate on_camera and voiceover_only. Preserve raw smartphone texture, handheld shake, focus/exposure changes, and vehicle sway when visible. A moving car is allowed; the presenter is a passenger, never the driver.",
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
    "- visual_transfer is the reusable visual contract. camera_composition must state the exact usable framing geometry, including where the hands, lap, table, or proof props remain visible. props must classify each visible item as source_product (replace with the client product), proof_prop (must remain because it proves the idea), or support_prop (must remain when it creates the scenario). Never classify neutral food, tools, containers, or a car interior as source_product just because they are visible. action_beats must name the visible action and its required prop. Use only unbranded descriptions.",
  ].join("\n");
}

export function renderDirectorBriefForScriptPrompt(brief: DirectorBrief | null) {
  if (!brief) return "";
  const handObjectInteractions = brief.hand_object_interactions || [];
  const motionContinuity = brief.motion_continuity || [];
  return [
    "Режиссерский анализ оригинального видео:",
    `- ${renderReferenceSceneModeForDirectorPrompt(resolveReferenceSceneMode(brief), resolveDirectorVisibleSubjectPolicy(brief))}`,
    `- ${renderVisibleSubjectPolicy(resolveDirectorVisibleSubjectPolicy(brief))}`,
    `- ${renderReferenceFormatContract(resolveReferenceFormatMode(brief), resolveReferenceSceneMode(brief))}`,
    brief.reference_render_mode ? `- Тип production: ${brief.reference_render_mode}; motion mode: ${brief.reference_motion_mode || "continuous_motion"}.` : "",
    `- Визуальный хук: ${brief.visual_hook.action}; удержание: ${brief.visual_hook.retention_trigger}.`,
    `- Атмосфера: ${brief.atmosphere.mood}; место: ${brief.atmosphere.setting}; свет: ${brief.atmosphere.lighting}.`,
    `- Одежда: ${brief.clothing.style}; палитра: ${brief.clothing.color_palette.join(", ") || "не указана"}; continuity: ${brief.wardrobe_continuity}.`,
    renderWardrobeTimelineForPrompt(brief),
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
    renderReferenceSceneModeForDirectorPrompt(resolveReferenceSceneMode(brief), resolveDirectorVisibleSubjectPolicy(brief)),
    renderVisibleSubjectPolicy(resolveDirectorVisibleSubjectPolicy(brief)),
    renderReferenceFormatContract(resolveReferenceFormatMode(brief), resolveReferenceSceneMode(brief)),
    brief.reference_render_mode
      ? `REFERENCE PRODUCTION MODE: ${brief.reference_render_mode}; motion mode: ${brief.reference_motion_mode || "continuous_motion"}.`
      : "",
    `REFERENCE DIRECTION: visual hook - ${brief.visual_hook.action}; retention trigger - ${brief.visual_hook.retention_trigger}.`,
    `ATMOSPHERE: ${brief.atmosphere.mood}; ${brief.atmosphere.setting}; ${brief.atmosphere.lighting}; ${brief.atmosphere.color_grading}.`,
    `WARDROBE POLICY: ${brief.wardrobe_continuity}; subject continuity: ${brief.subject_continuity}.`,
    `WARDROBE: ${brief.clothing.style}; ${brief.clothing.fit_details}; colors: ${brief.clothing.color_palette.join(", ") || "natural neutral palette"}; source: ${brief.clothing.source}.`,
    renderWardrobeTimelineForPrompt(brief),
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

function renderWardrobeTimelineForPrompt(brief: DirectorBrief) {
  if (!brief.wardrobe_timeline?.length) return "- Временная одежда по кадрам не подтверждена анализом; не выдумывай смену или фиксацию одежды.";
  return `- Одежда по таймлайну: ${brief.wardrobe_timeline.map((item) => `${item.start_sec}-${item.end_sec}s ${item.subject_id}: ${item.visible ? item.description || "видимая одежда без деталей" : "одежда не видна"}`).join(" | ")}.`;
}

function buildDirectorBriefSkeleton() {
  return {
    reference_subject_mode: "presenter|voiceover_broll|faceless_hands|body_crop|object_only",
    visible_subject_policy: "presenter|silent_avatar|no_people|hands_only|object_only|animation",
    reference_format_mode: "continuous_story|voiceover_montage",
    reference_render_mode: "talking_head|voiceover_broll|fast_montage|object_hands|animation|mixed",
    reference_motion_mode: "continuous_motion|montage|animated_still",
    audio_profile: {
      music_present: false,
      music_role: "none|background_bed|rhythmic_edit_driver|emotional_accent|unknown",
      mood: "energetic|calm|dramatic|inspiring|playful|serious",
      energy: "low|medium|high|unknown",
      tempo: "slow|medium|fast|unknown",
      voice_priority: "low|medium|high|unknown",
      confidence: 0,
      evidence: "",
    },
    visual_hook: { action: "", retention_trigger: "" },
    atmosphere: { mood: "", lighting: "", color_grading: "", setting: "" },
    clothing: {
      style: "",
      color_palette: [""],
      fit_details: "",
      source: "main presenter",
      adaptation_notes: "adapt gendered garments to the avatar gender/body while keeping color, formality, layer, and mood",
    },
    wardrobe_continuity: "stable|changes_between_cuts|not_visible|unknown",
    subject_continuity: "single_subject|multiple_subjects|no_visible_subject|unknown",
    wardrobe_timeline: [{ start_sec: 0, end_sec: 0, subject_id: "primary_subject", visible: true, description: "", change_note: "", confidence: 0 }],
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
      speech_mode: "on_camera|voiceover_only|silent",
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
    visual_transfer: {
      camera_composition: "exact framing geometry: side phone angle, lower frame keeps the lap and food containers visible",
      props: [{ role: "proof_prop", description: "unbranded food container on the lap", visible_from_start: true }],
      action_beats: [{ timestamp_sec: 0, action: "holds the food container while speaking", required_prop: "unbranded food container on the lap" }],
    },
  };
}
