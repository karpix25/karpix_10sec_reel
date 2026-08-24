import type {
  DirectorBrief,
  DirectorCameraTimelineItem,
  DirectorLocationTimelineItem,
  DirectorSegmentProfile,
} from "./director-analysis-types";
import { selectDirectorWardrobeTimelineItem } from "./director-wardrobe";

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
  };
}

function inferSpeechMode(value: string) {
  if (/voice[- ]?over|off[- ]?camera|b[-\s]?roll|cutaway|insert|перебив|закадр/iu.test(value)) {
    return "voiceover_only" as const;
  }
  return "on_camera" as const;
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
