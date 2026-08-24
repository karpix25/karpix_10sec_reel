import type { PhysicalSpeechMode } from "../../omni/physical-scene-types";
import {
  selectDirectorSegmentProfile,
  type DirectorBrief,
  type DirectorSegmentProfile,
  type ReferenceMotionMode,
  type ReferenceRenderMode,
} from "./director-analysis-types";
import {
  isFacelessReferenceScene,
  resolveReferenceSceneMode,
  type ReferenceSceneMode,
} from "./omni-reference-scene-mode";
import {
  isVoiceoverMontageReference,
  resolveReferenceFormatMode,
  type ReferenceFormatMode,
} from "./omni-reference-format-mode";
import { sanitizeCameraStabilizationForPrompt } from "./omni-scene-safety-contract";

export type ReferenceSegmentBeat = {
  startSeconds: number;
  endSeconds: number;
  sourceStartSeconds: number;
  sourceEndSeconds: number;
  action: string;
  gesture: string;
  camera: string;
  setting: string;
  environment: string;
  lighting: string;
  speechMode: PhysicalSpeechMode;
};

export type ReferenceSegmentPlan = {
  version: "reference-segment-plan-v1";
  segmentIndex: number;
  outputStartSeconds: number;
  outputEndSeconds: number;
  durationSeconds: number;
  sourceStartSeconds: number;
  sourceEndSeconds: number;
  sceneMode: ReferenceSceneMode;
  formatMode: ReferenceFormatMode;
  renderMode: ReferenceRenderMode;
  motionMode: ReferenceMotionMode;
  recommendedReferenceFrameCount: number;
  confidence: "high" | "medium";
  beats: readonly ReferenceSegmentBeat[];
};

export function buildReferenceSegmentPlan(input: {
  brief?: DirectorBrief | null;
  segmentIndex: number;
  segmentCount: number;
  segmentSeconds: number;
  outputStartSeconds?: number;
  outputTotalDurationSeconds?: number;
  sourceDurationSeconds?: number | null;
}): ReferenceSegmentPlan | null {
  const brief = input.brief;
  if (!brief || input.segmentCount <= 0 || input.segmentIndex <= 0) return null;

  const durationSeconds = positive(input.segmentSeconds, 10);
  const outputStartSeconds = positive(input.outputStartSeconds, (input.segmentIndex - 1) * durationSeconds);
  const totalOutputDurationSeconds = positive(
    input.outputTotalDurationSeconds,
    input.segmentCount * durationSeconds
  );
  const sourceDurationSeconds = positive(input.sourceDurationSeconds, totalOutputDurationSeconds);
  const sourceStartSeconds = round((outputStartSeconds / totalOutputDurationSeconds) * sourceDurationSeconds);
  const sourceEndSeconds = round(
    Math.min(sourceDurationSeconds, ((outputStartSeconds + durationSeconds) / totalOutputDurationSeconds) * sourceDurationSeconds)
  );
  const sceneMode = resolveReferenceSceneMode(brief);
  const formatMode = resolveReferenceFormatMode(brief);
  const renderMode = resolveReferenceRenderMode({ brief, sceneMode, formatMode });
  const motionMode = resolveReferenceMotionMode(brief.reference_motion_mode, renderMode);
  const beatCount = resolveBeatCount(renderMode);
  const beats = Array.from({ length: beatCount }, (_, index) => {
    const profile = selectDirectorSegmentProfile({
      brief,
      segmentIndex: input.segmentIndex,
      segmentCount: input.segmentCount,
      frameIndex: index + 1,
      frameCount: beatCount,
    });
    const startSeconds = round((index * durationSeconds) / beatCount);
    const endSeconds = round(((index + 1) * durationSeconds) / beatCount);
    const sourceStart = round(sourceStartSeconds + ((sourceEndSeconds - sourceStartSeconds) * index) / beatCount);
    const sourceEnd = round(sourceStartSeconds + ((sourceEndSeconds - sourceStartSeconds) * (index + 1)) / beatCount);
    return buildBeat({
      profile,
      startSeconds,
      endSeconds,
      sourceStartSeconds: sourceStart,
      sourceEndSeconds: sourceEnd,
      renderMode,
    });
  });

  return {
    version: "reference-segment-plan-v1",
    segmentIndex: input.segmentIndex,
    outputStartSeconds: round(outputStartSeconds),
    outputEndSeconds: round(outputStartSeconds + durationSeconds),
    durationSeconds: round(durationSeconds),
    sourceStartSeconds,
    sourceEndSeconds,
    sceneMode,
    formatMode,
    renderMode,
    motionMode,
    recommendedReferenceFrameCount: resolveReferenceFrameCount(renderMode, beats.length),
    confidence: resolveConfidence(brief),
    beats,
  };
}

export function resolveReferenceRenderMode(input: {
  brief: DirectorBrief;
  sceneMode?: ReferenceSceneMode;
  formatMode?: ReferenceFormatMode;
}): ReferenceRenderMode {
  if (input.brief.reference_render_mode) return input.brief.reference_render_mode;
  const sceneMode = input.sceneMode || resolveReferenceSceneMode(input.brief);
  const formatMode = input.formatMode || resolveReferenceFormatMode(input.brief);
  if (sceneMode === "voiceover_broll") return "voiceover_broll";
  if (isFacelessReferenceScene(sceneMode)) return "object_hands";
  if (isVoiceoverMontageReference(formatMode)) {
    const hasOnCameraAndVoiceover = new Set(
      (input.brief.camera_timeline || []).map((item) => item.speech_mode)
    );
    return hasOnCameraAndVoiceover.has("on_camera") && hasOnCameraAndVoiceover.has("voiceover_only")
      ? "mixed"
      : "fast_montage";
  }
  return "talking_head";
}

export function resolveReferenceFrameCount(renderMode: ReferenceRenderMode, beatCount = 3) {
  const base = renderMode === "talking_head" ? 2
    : renderMode === "animation" || renderMode === "fast_montage" ? 5
      : 4;
  return Math.max(2, Math.min(5, Math.max(base, beatCount)));
}

export function renderReferenceSegmentPlanForPrompt(plan: ReferenceSegmentPlan | null | undefined) {
  if (!plan) return "";
  return [
    "REFERENCE INSPIRATION: use only the macro production type and broad energy.",
    `Segment ${plan.segmentIndex}, ${plan.durationSeconds}s; suggested format=${plan.renderMode}; suggested motion=${plan.motionMode}.`,
    "Create original scene beats, camera choices, actions, locations, and cut timing for the approved script and product. Exact source windows and observed shot order are not requirements.",
  ].join("\n");
}

function buildBeat(input: {
  profile: DirectorSegmentProfile | null;
  startSeconds: number;
  endSeconds: number;
  sourceStartSeconds: number;
  sourceEndSeconds: number;
  renderMode: ReferenceRenderMode;
}): ReferenceSegmentBeat {
  const profile = input.profile;
  return {
    startSeconds: input.startSeconds,
    endSeconds: input.endSeconds,
    sourceStartSeconds: input.sourceStartSeconds,
    sourceEndSeconds: input.sourceEndSeconds,
    action: profile?.action_description || defaultAction(input.renderMode),
    gesture: profile?.actor_gesture || "естественное движение в рамках reference",
    camera: renderCamera(profile),
    setting: profile?.setting || "локация из reference",
    environment: profile?.environment || "визуальные детали из reference",
    lighting: profile?.lighting || "свет из reference",
    speechMode: profile?.speech_mode || "voiceover_only",
  };
}

function renderCamera(profile: DirectorSegmentProfile | null) {
  if (!profile) return "ракурс и движение камеры из reference";
  return [
    profile.camera.shot_types.join(", "),
    profile.camera.angles.join(", "),
    profile.camera.movements.join(", "),
    sanitizeCameraStabilizationForPrompt(profile.camera.stabilization),
  ].filter(Boolean).join("; ") || "ракурс и движение камеры из reference";
}

function defaultAction(renderMode: ReferenceRenderMode) {
  if (renderMode === "fast_montage" || renderMode === "mixed") return "следующий визуальный монтажный beat из reference";
  if (renderMode === "voiceover_broll") return "самостоятельная B-roll сцена по смыслу текущей реплики";
  if (renderMode === "animation") return "стилизованное движение в наблюдаемой анимационной механике";
  if (renderMode === "object_hands") return "действие руками или объектом из reference";
  return "продолжение действия и речи из reference";
}

function resolveBeatCount(renderMode: ReferenceRenderMode) {
  return renderMode === "fast_montage" || renderMode === "mixed" ? 5 : 3;
}

function resolveReferenceMotionMode(
  explicit: ReferenceMotionMode | undefined,
  renderMode: ReferenceRenderMode
): ReferenceMotionMode {
  if (explicit) return explicit;
  if (renderMode === "animation") return "animated_still";
  if (renderMode === "fast_montage" || renderMode === "mixed") return "montage";
  return "continuous_motion";
}

function resolveConfidence(brief: DirectorBrief): "high" | "medium" {
  return (brief.camera_timeline?.length || 0) >= 2 && (brief.action_beats?.length || 0) >= 2
    ? "high"
    : "medium";
}

function positive(value: number | null | undefined, fallback: number) {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : fallback;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function compact(value: string, maxLength = 160) {
  const text = value.replace(/\s+/gu, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).replace(/\s+\S*$/u, "").trim()}…`;
}
