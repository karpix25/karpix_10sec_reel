import { normalizeReferenceSceneMode, type ReferenceSceneMode } from "./omni-reference-scene-mode";
import { normalizeReferenceFormatMode, type ReferenceFormatMode } from "./omni-reference-format-mode";
import type { PhysicalSpeechMode } from "../../omni/physical-scene-types";

export type DirectorAnalysisStatus = "pending" | "processing" | "completed" | "failed";

export type DirectorLocationTimelineItem = {
  start_sec: number;
  end_sec: number;
  setting: string;
  environment: string;
  lighting: string;
};

export type DirectorCameraProfile = {
  shot_types: string[];
  angles: string[];
  movements: string[];
  stabilization: string;
};

export type DirectorCameraTimelineItem = DirectorCameraProfile & {
  start_sec: number;
  end_sec: number;
  setting: string;
  environment: string;
  lighting: string;
  action_description: string;
  actor_gesture: string;
  speech_mode: PhysicalSpeechMode;
};

export type DirectorSegmentProfile = {
  camera: DirectorCameraProfile;
  setting: string;
  environment: string;
  lighting: string;
  action_description: string;
  actor_gesture: string;
  speech_mode: PhysicalSpeechMode;
};

export type DirectorProductIntroductionPosition = "hook" | "body" | "payoff" | "never";

export type DirectorProductIntroduction = {
  first_appearance_sec: number;
  relative_position: DirectorProductIntroductionPosition;
  introduction_style: string;
  naturality_notes: string;
};

export type DirectorVisualPropRole = "source_product" | "proof_prop" | "support_prop";

export type DirectorVisualTransferContract = {
  camera_composition: string;
  props: Array<{
    role: DirectorVisualPropRole;
    description: string;
    visible_from_start: boolean;
  }>;
  action_beats: Array<{
    timestamp_sec: number;
    action: string;
    required_prop?: string;
  }>;
};

export type DirectorBrief = {
  reference_subject_mode?: ReferenceSceneMode;
  reference_format_mode?: ReferenceFormatMode;
  visual_hook: {
    action: string;
    retention_trigger: string;
  };
  atmosphere: {
    mood: string;
    lighting: string;
    color_grading: string;
    setting: string;
  };
  clothing: {
    style: string;
    color_palette: string[];
    fit_details: string;
    source: string;
    adaptation_notes?: string;
  };
  location_timeline?: DirectorLocationTimelineItem[];
  camera_timeline?: DirectorCameraTimelineItem[];
  camera: DirectorCameraProfile;
  montage_rhythm: {
    cut_pace: string;
    beat_sync: string;
    transition_style: string[];
  };
  action_beats: Array<{
    timestamp_sec: number;
    action_description: string;
    actor_gesture: string;
  }>;
  prop_sources: string[];
  hand_object_interactions: string[];
  motion_continuity: string[];
  reference_action_style: string;
  reusable_mechanics: {
    visual_mechanics: string[];
    safe_zones_for_elements: string;
    looping_pattern: string;
  };
  product_introduction?: DirectorProductIntroduction;
  visual_transfer?: DirectorVisualTransferContract;
};

export type OmniDirectorAnalysis = {
  id: number;
  project_id: number | null;
  product_id: number | null;
  legacy_source: string;
  legacy_scenario_id: number;
  source_legacy_client_id: number | null;
  original_reels_url: string | null;
  resolved_video_url: string | null;
  stored_video_url: string | null;
  video_storage_status: string | null;
  video_storage_error: string | null;
  source_snapshot: Record<string, unknown> | null;
  scrapecreators_payload: Record<string, unknown> | null;
  director_analysis_status: DirectorAnalysisStatus;
  director_analysis_json: DirectorBrief | null;
  analysis_verification: Record<string, unknown> | null;
  analysis_model: string | null;
  analysis_prompt_version: string;
  analysis_error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export function normalizeDirectorBrief(value: unknown): DirectorBrief | null {
  const candidate = unwrapDirectorBrief(value);
  if (!isRecord(candidate)) return null;

  const visualHook = candidate.visual_hook;
  const atmosphere = candidate.atmosphere;
  const clothing = candidate.clothing;
  const camera = candidate.camera;
  const montage = candidate.montage_rhythm;
  const mechanics = candidate.reusable_mechanics;
  if (
    !isRecord(visualHook) ||
    !isRecord(atmosphere) ||
    !isRecord(clothing) ||
    !isRecord(camera) ||
    !isRecord(montage) ||
    !isRecord(mechanics)
  ) {
    return null;
  }

  const brief: DirectorBrief = {
    reference_subject_mode: normalizeReferenceSceneMode(
      candidate.reference_subject_mode ?? candidate.referenceSceneMode ?? candidate.reference_scene_mode ?? candidate.referenceSubjectMode
    ) || undefined,
    reference_format_mode: normalizeReferenceFormatMode(
      candidate.reference_format_mode ?? candidate.referenceFormatMode
    ) || undefined,
    visual_hook: {
      action: stringValue(visualHook.action),
      retention_trigger: stringValue(visualHook.retention_trigger),
    },
    atmosphere: {
      mood: stringValue(atmosphere.mood),
      lighting: stringValue(atmosphere.lighting),
      color_grading: stringValue(atmosphere.color_grading),
      setting: stringValue(atmosphere.setting),
    },
    clothing: {
      style: stringValue(clothing.style),
      color_palette: stringArray(clothing.color_palette),
      fit_details: stringValue(clothing.fit_details),
      source: stringValue(clothing.source) || "main presenter wardrobe style from reference video",
      adaptation_notes: stringValue(clothing.adaptation_notes),
    },
    location_timeline: Array.isArray(candidate.location_timeline)
      ? candidate.location_timeline.map(normalizeLocationTimelineItem).filter((item): item is DirectorLocationTimelineItem => Boolean(item))
      : [],
    camera_timeline: Array.isArray(candidate.camera_timeline)
      ? candidate.camera_timeline.map(normalizeCameraTimelineItem).filter((item): item is DirectorCameraTimelineItem => Boolean(item))
      : [],
    camera: {
      shot_types: stringArray(camera.shot_types),
      angles: stringArray(camera.angles),
      movements: stringArray(camera.movements),
      stabilization: stringValue(camera.stabilization),
    },
    montage_rhythm: {
      cut_pace: stringValue(montage.cut_pace),
      beat_sync: stringValue(montage.beat_sync),
      transition_style: stringArray(montage.transition_style),
    },
    action_beats: Array.isArray(candidate.action_beats)
      ? candidate.action_beats.map(normalizeActionBeat).filter((beat): beat is DirectorBrief["action_beats"][number] => Boolean(beat))
      : [],
    prop_sources: stringArray(candidate.prop_sources),
    hand_object_interactions: stringArray(candidate.hand_object_interactions),
    motion_continuity: stringArray(candidate.motion_continuity),
    reference_action_style: stringValue(candidate.reference_action_style),
    reusable_mechanics: {
      visual_mechanics: stringArray(mechanics.visual_mechanics),
      safe_zones_for_elements: stringValue(mechanics.safe_zones_for_elements),
      looping_pattern: stringValue(mechanics.looping_pattern),
    },
    product_introduction: normalizeProductIntroduction(candidate.product_introduction),
    visual_transfer: normalizeVisualTransferContract(candidate.visual_transfer),
  };

  return hasRequiredDirectorText(brief) ? brief : null;
}

export function extractDirectorBriefFromSnapshot(snapshot: unknown): DirectorBrief | null {
  if (!isRecord(snapshot)) return null;
  return normalizeDirectorBrief(snapshot.director_analysis);
}

export function selectDirectorSegmentProfile(input: {
  brief?: DirectorBrief | null;
  segmentIndex: number;
  segmentCount: number;
  frameIndex: number;
  frameCount: number;
}): DirectorSegmentProfile | null {
  const brief = input.brief;
  if (!brief) return null;

  const timeline = brief.camera_timeline || [];
  const locationTimeline = brief.location_timeline || [];
  const position = ((input.segmentIndex - 1) + (input.frameIndex - 0.5) / Math.max(1, input.frameCount)) /
    Math.max(1, input.segmentCount);
  const targetTime = selectTargetTime({ timeline, locationTimeline, actionBeats: brief.action_beats, position });
  const camera = selectTimelineItem(timeline, targetTime);
  const location = selectTimelineItem(locationTimeline, targetTime);
  const action = selectActionBeat(brief.action_beats, targetTime);

  return {
    camera: {
      shot_types: camera?.shot_types.length ? camera.shot_types : brief.camera.shot_types,
      angles: camera?.angles.length ? camera.angles : brief.camera.angles,
      movements: camera?.movements.length ? camera.movements : brief.camera.movements,
      stabilization: camera?.stabilization || brief.camera.stabilization,
    },
    setting: camera?.setting || location?.setting || brief.atmosphere.setting,
    environment: camera?.environment || location?.environment || "",
    lighting: camera?.lighting || location?.lighting || brief.atmosphere.lighting,
    action_description: camera?.action_description || action?.action_description || "",
    actor_gesture: camera?.actor_gesture || action?.actor_gesture || "",
    speech_mode: camera?.speech_mode || inferSpeechMode(camera?.action_description || action?.action_description || ""),
  };
}

function unwrapDirectorBrief(value: unknown) {
  if (!isRecord(value)) return value;
  return value.director_brief || value.director_analysis || value;
}

function normalizeActionBeat(value: unknown) {
  if (!isRecord(value)) return null;
  const action = stringValue(value.action_description);
  const gesture = stringValue(value.actor_gesture);
  if (!action && !gesture) return null;
  return {
    timestamp_sec: Number(value.timestamp_sec || 0) || 0,
    action_description: action,
    actor_gesture: gesture,
  };
}

function normalizeLocationTimelineItem(value: unknown) {
  if (!isRecord(value)) return null;
  const setting = stringValue(value.setting);
  const environment = stringValue(value.environment);
  const lighting = stringValue(value.lighting);
  if (!setting && !environment && !lighting) return null;
  const start = Number(value.start_sec || value.start_seconds || value.timestamp_start_sec || 0) || 0;
  const end = Number(value.end_sec || value.end_seconds || value.timestamp_end_sec || start) || start;
  return {
    start_sec: Math.max(0, start),
    end_sec: Math.max(Math.max(0, start), end),
    setting,
    environment,
    lighting,
  };
}

function normalizeCameraTimelineItem(value: unknown) {
  if (!isRecord(value)) return null;
  const camera = isRecord(value.camera) ? value.camera : value;
  const start = Number(value.start_sec || value.start_seconds || value.timestamp_start_sec || 0) || 0;
  const end = Number(value.end_sec || value.end_seconds || value.timestamp_end_sec || start) || start;
  const item: DirectorCameraTimelineItem = {
    start_sec: Math.max(0, start),
    end_sec: Math.max(Math.max(0, start), end),
    shot_types: stringArray(camera.shot_types),
    angles: stringArray(camera.angles),
    movements: stringArray(camera.movements),
    stabilization: stringValue(camera.stabilization),
    setting: stringValue(value.setting),
    environment: stringValue(value.environment),
    lighting: stringValue(value.lighting),
    action_description: stringValue(value.action_description || value.action),
    actor_gesture: stringValue(value.actor_gesture || value.gesture),
    speech_mode: normalizeSpeechMode(value.speech_mode || value.speechMode || value.delivery_mode || camera.speech_mode || camera.speechMode) ||
      inferSpeechMode(stringValue(value.action_description || value.action)),
  };
  return item.shot_types.length || item.angles.length || item.movements.length || item.setting || item.action_description
    ? item
    : null;
}

function normalizeSpeechMode(value: unknown): PhysicalSpeechMode | null {
  if (value === "on_camera" || value === "voiceover_only" || value === "silent") return value;
  if (value === "voiceover" || value === "off_camera" || value === "broll") return "voiceover_only";
  return null;
}

function inferSpeechMode(value: string): PhysicalSpeechMode {
  return /voice[- ]?over|off[- ]?camera|b[-\s]?roll|cutaway|insert|перебив|закадр/iu.test(value)
    ? "voiceover_only"
    : "on_camera";
}

function selectTargetTime(input: {
  timeline: readonly DirectorCameraTimelineItem[];
  locationTimeline: readonly DirectorLocationTimelineItem[];
  actionBeats: readonly DirectorBrief["action_beats"][number][];
  position: number;
}) {
  const starts = [
    ...input.timeline.map((item) => item.start_sec),
    ...input.locationTimeline.map((item) => item.start_sec),
    ...input.actionBeats.map((item) => item.timestamp_sec),
  ].filter(Number.isFinite);
  const ends = [
    ...input.timeline.map((item) => item.end_sec),
    ...input.locationTimeline.map((item) => item.end_sec),
    ...input.actionBeats.map((item) => item.timestamp_sec),
  ].filter(Number.isFinite);
  const start = starts.length ? Math.min(...starts) : 0;
  const end = ends.length ? Math.max(...ends) : start;
  return start + Math.max(0, Math.min(1, input.position)) * Math.max(0, end - start);
}

function selectTimelineItem<T extends { start_sec: number; end_sec: number }>(items: readonly T[], targetTime: number) {
  if (!items.length) return null;
  return items.find((item) => item.start_sec <= targetTime && targetTime <= item.end_sec) ||
    items.reduce((best, item) =>
      Math.abs((item.start_sec + item.end_sec) / 2 - targetTime) < Math.abs((best.start_sec + best.end_sec) / 2 - targetTime)
        ? item
        : best
    );
}

function selectActionBeat(items: readonly DirectorBrief["action_beats"][number][], targetTime: number) {
  if (!items.length) return null;
  return items.reduce((best, item) =>
    Math.abs(item.timestamp_sec - targetTime) < Math.abs(best.timestamp_sec - targetTime) ? item : best
  );
}

function hasRequiredDirectorText(brief: DirectorBrief) {
  return Boolean(
    brief.visual_hook.action &&
      brief.visual_hook.retention_trigger &&
      brief.atmosphere.setting &&
      brief.clothing.style &&
      brief.camera.shot_types.length &&
      brief.montage_rhythm.cut_pace &&
      brief.reusable_mechanics.visual_mechanics.length
  );
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => stringValue(item)).filter(Boolean);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeProductIntroduction(value: unknown): DirectorProductIntroduction | undefined {
  if (!isRecord(value)) return undefined;
  const position = stringValue(value.relative_position);
  const validPositions: DirectorProductIntroductionPosition[] = ["hook", "body", "payoff", "never"];
  const relative_position: DirectorProductIntroductionPosition =
    validPositions.includes(position as DirectorProductIntroductionPosition)
      ? (position as DirectorProductIntroductionPosition)
      : "never";
  const first_appearance_sec = Number(value.first_appearance_sec) || 0;
  const introduction_style = stringValue(value.introduction_style);
  const naturality_notes = stringValue(value.naturality_notes);
  if (!introduction_style && relative_position === "never") return undefined;
  return { first_appearance_sec, relative_position, introduction_style, naturality_notes };
}

function normalizeVisualTransferContract(value: unknown): DirectorVisualTransferContract | undefined {
  if (!isRecord(value)) return undefined;
  const props = Array.isArray(value.props)
    ? value.props.map(normalizeVisualTransferProp).filter((item): item is DirectorVisualTransferContract["props"][number] => Boolean(item))
    : [];
  const action_beats = Array.isArray(value.action_beats)
    ? value.action_beats.map(normalizeVisualTransferAction).filter((item): item is DirectorVisualTransferContract["action_beats"][number] => Boolean(item))
    : [];
  const camera_composition = stringValue(value.camera_composition);
  return camera_composition || props.length || action_beats.length
    ? { camera_composition, props, action_beats }
    : undefined;
}

function normalizeVisualTransferProp(value: unknown) {
  if (!isRecord(value)) return null;
  const role = stringValue(value.role);
  const description = stringValue(value.description);
  if (!description || !["source_product", "proof_prop", "support_prop"].includes(role)) return null;
  return {
    role: role as DirectorVisualPropRole,
    description,
    visible_from_start: value.visible_from_start === true,
  };
}

function normalizeVisualTransferAction(value: unknown) {
  if (!isRecord(value)) return null;
  const action = stringValue(value.action);
  if (!action) return null;
  return {
    timestamp_sec: Math.max(0, Number(value.timestamp_sec) || 0),
    action,
    ...(stringValue(value.required_prop) ? { required_prop: stringValue(value.required_prop) } : {}),
  };
}
