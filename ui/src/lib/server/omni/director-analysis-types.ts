export type DirectorAnalysisStatus = "pending" | "processing" | "completed" | "failed";

export type DirectorBrief = {
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
  };
  camera: {
    shot_types: string[];
    angles: string[];
    movements: string[];
    stabilization: string;
  };
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
  reusable_mechanics: {
    visual_mechanics: string[];
    safe_zones_for_elements: string;
    looping_pattern: string;
  };
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
    },
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
    reusable_mechanics: {
      visual_mechanics: stringArray(mechanics.visual_mechanics),
      safe_zones_for_elements: stringValue(mechanics.safe_zones_for_elements),
      looping_pattern: stringValue(mechanics.looping_pattern),
    },
  };

  return hasRequiredDirectorText(brief) ? brief : null;
}

export function extractDirectorBriefFromSnapshot(snapshot: unknown): DirectorBrief | null {
  if (!isRecord(snapshot)) return null;
  return normalizeDirectorBrief(snapshot.director_analysis);
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
