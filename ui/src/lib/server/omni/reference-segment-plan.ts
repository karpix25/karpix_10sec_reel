import type { PhysicalSpeechMode } from "../../omni/physical-scene-types";
import type { OmniStoryboardSegment } from "../../omni/storyboard/omni-storyboard-types";
import type { StoryboardFrame } from "./llm-prompt-chain-types";
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
import type { DirectorSourceRole, DirectorVisibleSubjectRole } from "./director-source-interval";
import { reconcileReferenceSegmentPlanToSpeech } from "./omni-speech-visual-alignment";
import { buildProductBrollAction, buildProductBrollCamera } from "./omni-product-broll-contract";
import { repairReferenceSourceFrame } from "./reference-source-frame-repair";

export type ReferenceSpeechAlignmentDecision = {
  sourceBeatIndex: number;
  targetBeatIndex: number;
  sourceStartSeconds: number;
  sourceEndSeconds: number;
  speechFrameIndexes: readonly number[];
  spokenText: string;
  reason: "unfinished_speech_unit";
};

export type ReferenceSpeechAlignment = {
  version: "reference-speech-alignment-v1";
  changed: boolean;
  decisions: readonly ReferenceSpeechAlignmentDecision[];
};

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
  visibleSubjectRole?: DirectorVisibleSubjectRole;
  avatarAllowed?: boolean;
  sourceRole?: DirectorSourceRole;
  visualDescription?: string;
  composition?: string;
  visibleObjects?: readonly string[];
  transitionIn?: string;
  transitionOut?: string;
  adaptationRule?: string;
};

export type ReferenceSegmentPlan = {
  version: "reference-segment-plan-v1";
  segmentIndex: number;
  segmentCount?: number;
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
  speechAlignment?: ReferenceSpeechAlignment;
};

const BROLL_SOURCE_ROLES = new Set(["environment_broll", "product_broll", "proof_broll", "transition"]);
const NON_PRESENTER_SUBJECT_ROLES = new Set(["background_person", "no_people", "hands_only", "object_only"]);

export function isReferencePresenterSource(beat: ReferenceSegmentBeat) {
  if (beat.avatarAllowed === false) return false;
  return beat.speechMode === "on_camera" ||
    beat.visibleSubjectRole === "primary_presenter" ||
    (beat.sourceRole === "presenter" && beat.avatarAllowed === true);
}

export function isReferenceBrollSource(beat: ReferenceSegmentBeat) {
  return BROLL_SOURCE_ROLES.has(beat.sourceRole || "") ||
    beat.speechMode === "voiceover_only" ||
    beat.avatarAllowed === false ||
    NON_PRESENTER_SUBJECT_ROLES.has(beat.visibleSubjectRole || "");
}

export function allowsTalkingAvatarIntro(plan: ReferenceSegmentPlan, frameIndex: number) {
  return plan.sceneMode === "presenter" && frameIndex === 0 && !plan.beats.some(isReferencePresenterSource);
}

export function resolveReferenceSegmentBeatForFrame(
  plan: ReferenceSegmentPlan | null | undefined,
  frameIndex: number,
  frameCount: number,
): ReferenceSegmentBeat | null {
  if (!plan || frameIndex <= 0 || frameCount <= 0) return null;
  const frameCenterSeconds = ((frameIndex - 0.5) / frameCount) * plan.durationSeconds;
  return plan.beats.find((beat) =>
    frameCenterSeconds >= beat.startSeconds && frameCenterSeconds < beat.endSeconds
  ) || plan.beats[plan.beats.length - 1] || null;
}

export function applyReferenceSegmentPlanToFrames<T extends {
  role: StoryboardFrame["role"];
  action: string;
  camera: string;
  visualDescription: string;
}>(
  plan: ReferenceSegmentPlan | null | undefined,
  frames: readonly T[],
  enabled = false,
  options: { productVisibleByFrame?: readonly boolean[] } = {},
) {
  if (!plan || !enabled) return frames;
  return frames.map((frame, index) => {
    const beat = resolveReferenceSegmentBeatForFrame(plan, index + 1, frames.length);
    if (!beat) return frame;
    const productVisible = options.productVisibleByFrame?.[index] === true;
    const avatarIntro = !productVisible && allowsTalkingAvatarIntro(plan, index) &&
      (frame.role === "face_open" || frame.role === "face_return");
    const sourceFrame = repairReferenceSourceFrame({
      beat,
      currentRole: frame.role,
      currentAction: frame.action,
      currentCamera: frame.camera,
      currentVisualDescription: frame.visualDescription,
      frameIndex: index,
      frameCount: frames.length,
      productVisible,
      avatarIntro,
      presenterSource: isReferencePresenterSource(beat),
      brollSource: isReferenceBrollSource(beat),
    });
    return {
      ...frame,
      ...sourceFrame,
      role: productVisible ? "product_cutaway" : sourceFrame.role,
      action: productVisible ? buildProductBrollAction("продукт клиента", false) : sourceFrame.action,
      camera: productVisible ? buildProductBrollCamera() : sourceFrame.camera,
      visualDescription: productVisible ? "Предметный B-roll: продукт на устойчивой поверхности, без людей и рук" : sourceFrame.visualDescription,
    };
  });
}

export function applyReferenceSegmentPlanToStoryboard(
  plan: ReferenceSegmentPlan | null | undefined,
  storyboard: OmniStoryboardSegment,
  enabled = false,
  options: { productVisibleByFrame?: readonly boolean[] } = {},
): OmniStoryboardSegment {
  if (!plan || !enabled) return storyboard;
  return {
    ...storyboard,
    frames: storyboard.frames.map((frame, index) => {
      const beat = resolveReferenceSegmentBeatForFrame(plan, index + 1, storyboard.frames.length);
      if (!beat) return frame;
      const environment = [beat.setting, beat.environment, beat.lighting].filter(Boolean).join("; ");
      const productVisible = options.productVisibleByFrame?.[index] === true;
      const avatarIntro = !productVisible && allowsTalkingAvatarIntro(plan, index) && frame.speechMode === "on_camera";
      const speechMode = productVisible ? "voiceover_only" : avatarIntro ? "on_camera" : beat.speechMode;
      return {
        ...frame,
        camera: productVisible
          ? buildProductBrollCamera()
          : avatarIntro ? frame.camera : [beat.camera, beat.composition ? `composition ${beat.composition}` : ""].filter(Boolean).join("; "),
        environment: environment || frame.environment,
        speechMode,
        physicalPlan: frame.physicalPlan
          ? {
              ...frame.physicalPlan,
              speechMode,
            }
          : frame.physicalPlan,
      };
    }),
  };
}

export function buildReferenceSegmentPlan(input: {
  brief?: DirectorBrief | null;
  segmentIndex: number;
  segmentCount: number;
  segmentSeconds: number;
  outputStartSeconds?: number;
  outputTotalDurationSeconds?: number;
  sourceDurationSeconds?: number | null;
  voiceoverText?: string;
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
  const beats = buildReferenceBeatWindows({
    brief,
    segmentIndex: input.segmentIndex,
    segmentCount: input.segmentCount,
    durationSeconds,
    sourceDurationSeconds,
    sourceStartSeconds,
    sourceEndSeconds,
    renderMode,
  }).map((window) => buildBeat({ ...window, renderMode }));

  const plan: ReferenceSegmentPlan = {
    version: "reference-segment-plan-v1",
    segmentIndex: input.segmentIndex,
    segmentCount: input.segmentCount,
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
  return input.voiceoverText
    ? reconcileReferenceSegmentPlanToSpeech({
        plan,
        voiceoverText: input.voiceoverText,
        durationSeconds,
      }).plan
    : plan;
}

function buildReferenceBeatWindows(input: {
  brief: DirectorBrief;
  segmentIndex: number;
  segmentCount: number;
  durationSeconds: number;
  sourceDurationSeconds: number;
  sourceStartSeconds: number;
  sourceEndSeconds: number;
  renderMode: ReferenceRenderMode;
}) {
  const timeline = [...(input.brief.camera_timeline || [])].sort((left, right) => left.start_sec - right.start_sec);
  const sourceSpan = Math.max(0.01, input.sourceEndSeconds - input.sourceStartSeconds);
  const timelineStart = timeline[0]?.start_sec || 0;
  const timelineEnd = timeline[timeline.length - 1]?.end_sec || input.sourceDurationSeconds;
  const timelineSpan = Math.max(0.01, timelineEnd - timelineStart);
  const timelineWindows = timeline.flatMap((item) => {
    const sourceStart = Math.max(input.sourceStartSeconds, item.start_sec);
    const sourceEnd = Math.min(input.sourceEndSeconds, item.end_sec);
    if (sourceEnd <= sourceStart) return [];
    const midpoint = (sourceStart + sourceEnd) / 2;
    const sourcePosition = Math.max(0, Math.min(1, (midpoint - timelineStart) / timelineSpan));
    const profile = selectDirectorSegmentProfile({
      brief: input.brief,
      segmentIndex: 1,
      segmentCount: 1,
      frameIndex: Math.min(100, Math.max(1, Math.floor(sourcePosition * 99) + 1)),
      frameCount: 100,
    });
    return [{
      profile,
      startSeconds: round(((sourceStart - input.sourceStartSeconds) / sourceSpan) * input.durationSeconds),
      endSeconds: round(((sourceEnd - input.sourceStartSeconds) / sourceSpan) * input.durationSeconds),
      sourceStartSeconds: round(sourceStart),
      sourceEndSeconds: round(sourceEnd),
    }];
  });
  if (timelineWindows.length) return timelineWindows;

  const beatCount = resolveBeatCount(input.renderMode);
  return Array.from({ length: beatCount }, (_, index) => ({
    profile: selectDirectorSegmentProfile({
      brief: input.brief,
      segmentIndex: input.segmentIndex,
      segmentCount: input.segmentCount,
      frameIndex: index + 1,
      frameCount: beatCount,
    }),
    startSeconds: round((index * input.durationSeconds) / beatCount),
    endSeconds: round(((index + 1) * input.durationSeconds) / beatCount),
    sourceStartSeconds: round(input.sourceStartSeconds + ((input.sourceEndSeconds - input.sourceStartSeconds) * index) / beatCount),
    sourceEndSeconds: round(input.sourceStartSeconds + ((input.sourceEndSeconds - input.sourceStartSeconds) * (index + 1)) / beatCount),
  }));
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
    "REFERENCE SHOT CONTRACT: preserve the analyzed interval structure, visible-subject role, speech mode, avatar permission, composition, camera language, and cut rhythm. Replace source-specific people, wardrobe, location details, props, product, and spoken meaning only when the current product adaptation requires it.",
    "SPEECH BOUNDARY CONTRACT: current storyboard speech units are authoritative for visual cuts. Merge or omit a source cut that lands inside an unfinished phrase, pause, or residual sound; never recreate an internal micro-cut only because the source interval is short.",
    `Segment ${plan.segmentIndex}/${plan.segmentCount || "?"}, ${plan.durationSeconds}s; render=${plan.renderMode}; motion=${plan.motionMode}.`,
    plan.speechAlignment?.changed
      ? `PRE-RENDER SPEECH ALIGNMENT: ${plan.speechAlignment.decisions.map((decision) => `source beat ${decision.sourceBeatIndex + 1} ${decision.sourceStartSeconds}-${decision.sourceEndSeconds}s merged into beat ${decision.targetBeatIndex + 1} over speech frame(s) ${decision.speechFrameIndexes.join(", ") || "unknown"}: ${compact(decision.spokenText)}`).join("; ")}. Do not restore the removed internal cut.`
      : "",
    ...plan.beats.map((beat) => [
      `Beat ${beat.startSeconds}-${beat.endSeconds}s; source ${beat.sourceStartSeconds}-${beat.sourceEndSeconds}s`,
      `role=${beat.sourceRole || "unknown"}`,
      `subject=${beat.visibleSubjectRole || "unknown"}`,
      `avatar_allowed=${beat.avatarAllowed === true ? "true" : beat.avatarAllowed === false ? "false" : "unknown"}`,
      `speech=${beat.speechMode}`,
      `shown=${compact(beat.visualDescription || beat.action)}`,
      `composition=${compact(beat.composition || "not specified")}`,
      `objects=${beat.visibleObjects?.join(", ") || "none specified"}`,
      `camera=${compact(beat.camera)}`,
      `setting=${compact(beat.setting)}; environment=${compact(beat.environment)}; light=${compact(beat.lighting)}`,
      beat.transitionIn || beat.transitionOut ? `transition=${compact([beat.transitionIn, beat.transitionOut].filter(Boolean).join(" -> "))}` : "",
      beat.adaptationRule ? `adapt=${compact(beat.adaptationRule)}` : "",
    ].filter(Boolean).join("; ")),
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
    visibleSubjectRole: profile?.visible_subject_role,
    avatarAllowed: profile?.avatar_allowed,
    sourceRole: profile?.source_role,
    visualDescription: profile?.visual_description || profile?.action_description,
    composition: profile?.composition,
    visibleObjects: profile?.visible_objects,
    transitionIn: profile?.transition_in,
    transitionOut: profile?.transition_out,
    adaptationRule: profile?.adaptation_rule,
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
