import type {
  DirectorBrief,
  DirectorCameraTimelineItem,
  DirectorLocationTimelineItem,
  DirectorSegmentProfile,
} from "./director-analysis-types";
import { selectDirectorWardrobeTimelineItem } from "./director-wardrobe";
import {
  renderDirectorSubjectPolicy,
  type DirectorSourceRole,
  type DirectorVisibleSubjectRole,
} from "./director-source-interval";
import { resolveDirectorVisibleSubjectPolicy } from "./director-visibility-policy";

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
  const wardrobeTimeline = brief.wardrobe_timeline || [];
  const position = ((input.segmentIndex - 1) + (input.frameIndex - 0.5) / Math.max(1, input.frameCount)) /
    Math.max(1, input.segmentCount);
  const targetTime = selectTargetTime({
    timeline,
    locationTimeline,
    wardrobeTimeline,
    actionBeats: brief.action_beats,
    position,
  });
  const camera = selectTimelineItem(timeline, targetTime);
  const location = selectTimelineItem(locationTimeline, targetTime);
  const action = selectActionBeat(brief.action_beats, targetTime);
  const visibleSubjectRole = camera?.visible_subject_role || inferVisibleSubjectRole(camera?.speech_mode);

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
    wardrobe: selectDirectorWardrobeTimelineItem(wardrobeTimeline, targetTime),
    visible_subject_role: visibleSubjectRole,
    avatar_allowed: camera?.avatar_allowed,
    source_role: camera?.source_role || inferSourceRole(camera?.speech_mode),
    visual_description: camera?.visual_description || camera?.action_description || "",
    composition: camera?.composition || "",
    visible_objects: camera?.visible_objects || [],
    transition_in: camera?.transition_in || "",
    transition_out: camera?.transition_out || "",
    adaptation_rule: camera?.adaptation_rule || "",
  };
}

export function resolveDirectorSegmentFormat(brief?: DirectorBrief | null) {
  const timeline = brief?.camera_timeline || [];
  const hasOnCameraInterval = timeline.some((item) =>
    item.speech_mode === "on_camera" && item.visible_subject_role !== "no_people"
  );
  if (hasOnCameraInterval) return "talking_head_cutaways" as const;
  return resolveDirectorVisibleSubjectPolicy(brief) === "presenter"
    ? "talking_head_cutaways" as const
    : "voiceover_broll" as const;
}

export function renderDirectorTimelineForPrompt(brief?: DirectorBrief | null, limit = 36) {
  const timeline = (brief?.camera_timeline || []).slice(0, limit);
  if (!timeline.length) return "SOURCE SHOT TIMELINE: no detailed interval analysis is available.";
  return [
    "SOURCE SHOT TIMELINE: each line is a source interval. Preserve the interval's visible-subject role, speech mode, and avatar permission. Adapt only source-specific content, location, props, and product identity when the current script requires it.",
    ...timeline.map((item, index) => {
      const subjectPolicy = renderDirectorSubjectPolicy({
        visibleSubjectRole: item.visible_subject_role,
        avatarAllowed: item.avatar_allowed,
        speechMode: item.speech_mode,
      });
      return [
        `Interval ${index + 1}, ${item.start_sec}-${item.end_sec}s:`,
        `role=${item.source_role || "unknown"}`,
        `subject=${item.visible_subject_role || "unknown"}`,
        `avatar_allowed=${item.avatar_allowed === true ? "true" : item.avatar_allowed === false ? "false" : "unknown"}`,
        `speech=${item.speech_mode}`,
        `shown=${compact(item.visual_description || item.action_description, 240)}`,
        `composition=${compact(item.composition, 140)}`,
        `objects=${item.visible_objects?.slice(0, 5).join(", ") || "none specified"}`,
        `camera=${compact([...item.shot_types, ...item.angles, ...item.movements].join(", "), 160)}`,
        `transition=${compact([item.transition_in, item.transition_out].filter(Boolean).join(" -> "), 100)}`,
        subjectPolicy,
        item.adaptation_rule ? `adapt=${compact(item.adaptation_rule, 180)}` : "",
      ].filter(Boolean).join("; ");
    }),
  ].join("\n");
}

function inferSpeechMode(value: string) {
  if (/voice[- ]?over|off[- ]?camera|b[-\s]?roll|cutaway|insert|перебив|закадр/iu.test(value)) {
    return "voiceover_only" as const;
  }
  return "on_camera" as const;
}

function inferVisibleSubjectRole(speechMode: DirectorCameraTimelineItem["speech_mode"] = "on_camera"): DirectorVisibleSubjectRole {
  return speechMode === "on_camera" ? "primary_presenter" : "unknown";
}

function inferSourceRole(speechMode: DirectorCameraTimelineItem["speech_mode"] = "on_camera"): DirectorSourceRole {
  return speechMode === "on_camera" ? "presenter" : "environment_broll";
}

function selectTargetTime(input: {
  timeline: readonly DirectorCameraTimelineItem[];
  locationTimeline: readonly DirectorLocationTimelineItem[];
  wardrobeTimeline: readonly { start_sec: number; end_sec: number }[];
  actionBeats: readonly DirectorBrief["action_beats"][number][];
  position: number;
}) {
  const starts = [
    ...input.timeline.map((item) => item.start_sec),
    ...input.locationTimeline.map((item) => item.start_sec),
    ...input.wardrobeTimeline.map((item) => item.start_sec),
    ...input.actionBeats.map((item) => item.timestamp_sec),
  ].filter(Number.isFinite);
  const ends = [
    ...input.timeline.map((item) => item.end_sec),
    ...input.locationTimeline.map((item) => item.end_sec),
    ...input.wardrobeTimeline.map((item) => item.end_sec),
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
      Math.abs((item.start_sec + item.end_sec) / 2 - targetTime) <
      Math.abs((best.start_sec + best.end_sec) / 2 - targetTime)
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

function compact(value: string | undefined, maxLength: number) {
  const text = String(value || "").replace(/\s+/gu, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).replace(/\s+\S*$/u, "").trim()}…`;
}
