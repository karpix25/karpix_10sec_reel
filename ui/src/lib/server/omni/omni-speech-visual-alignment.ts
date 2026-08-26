import {
  getOmniStoryboardFrameCount,
  OMNI_STORYBOARD_SECONDS_PER_FRAME,
} from "../../omni/storyboard/omni-storyboard-timing";
import type {
  ReferenceSegmentBeat,
  ReferenceSegmentPlan,
  ReferenceSpeechAlignment,
  ReferenceSpeechAlignmentDecision,
} from "./reference-segment-plan";
import { splitStoryboardSpeechWithBoundaries, type StoryboardSpeechChunk } from "./storyboard/omni-storyboard-speech";

export function reconcileReferenceSegmentPlanToSpeech(input: {
  plan: ReferenceSegmentPlan | null | undefined;
  voiceoverText: string;
  durationSeconds: number;
}) {
  const speechUnits = buildSpeechUnits(input.voiceoverText, input.durationSeconds);
  if (!input.plan || speechUnits.length === 0 || input.plan.beats.length < 2) {
    return { plan: input.plan || null, speechUnits, alignment: input.plan?.speechAlignment || null };
  }

  const beats = input.plan.beats.map((beat, sourceBeatIndex) => ({ beat, sourceBeatIndex }));
  const decisions: ReferenceSpeechAlignmentDecision[] = [];
  let index = 0;
  while (index < beats.length) {
    const current = beats[index];
    const overlappingUnits = resolveSpeechUnits(current.beat, speechUnits);
    if (!isUnsafeCutaway(current.beat, overlappingUnits)) {
      index += 1;
      continue;
    }

    const targetIndex = selectMergeTarget(beats, index);
    if (targetIndex === null) {
      index += 1;
      continue;
    }

    const target = beats[targetIndex];
    beats[targetIndex] = {
      ...target,
      beat: mergeReferenceBeats(target.beat, current.beat),
    };
    decisions.push({
      sourceBeatIndex: current.sourceBeatIndex,
      targetBeatIndex: target.sourceBeatIndex,
      sourceStartSeconds: current.beat.sourceStartSeconds,
      sourceEndSeconds: current.beat.sourceEndSeconds,
      speechFrameIndexes: overlappingUnits.map((unit) => unit.frameIndex),
      spokenText: overlappingUnits.map((unit) => unit.text).join(" "),
      reason: "unfinished_speech_unit",
    });
    beats.splice(index, 1);
  }

  if (!decisions.length) return { plan: input.plan, speechUnits, alignment: input.plan.speechAlignment || null };
  const alignment: ReferenceSpeechAlignment = {
    version: "reference-speech-alignment-v1",
    changed: true,
    decisions: [ ...(input.plan.speechAlignment?.decisions || []), ...decisions ],
  };
  return {
    plan: { ...input.plan, beats: beats.map((entry) => entry.beat), speechAlignment: alignment },
    speechUnits,
    alignment,
  };
}

export function buildSpeechUnits(text: string, durationSeconds: number): StoryboardSpeechUnit[] {
  const frameCount = getOmniStoryboardFrameCount(durationSeconds);
  if (!frameCount) return [];
  return splitStoryboardSpeechWithBoundaries(text, frameCount).map((chunk, index) => ({
    ...chunk,
    frameIndex: index + 1,
    startSeconds: index * OMNI_STORYBOARD_SECONDS_PER_FRAME,
    endSeconds: (index + 1) * OMNI_STORYBOARD_SECONDS_PER_FRAME,
  }));
}

export type StoryboardSpeechUnit = StoryboardSpeechChunk & {
  frameIndex: number;
  startSeconds: number;
  endSeconds: number;
};

function isUnsafeCutaway(beat: ReferenceSegmentBeat, units: readonly StoryboardSpeechUnit[]) {
  const crossesStoryboardFrame = !isFrameBoundary(beat.startSeconds) || !isFrameBoundary(beat.endSeconds);
  return isCutawayBeat(beat) && crossesStoryboardFrame && units.some((unit) => unit.boundary === "continuation");
}

function isCutawayBeat(beat: ReferenceSegmentBeat) {
  if (beat.speechMode === "on_camera") return false;
  return beat.speechMode === "voiceover_only" ||
    beat.avatarAllowed === false ||
    beat.visibleSubjectRole === "no_people" ||
    beat.visibleSubjectRole === "hands_only" ||
    beat.visibleSubjectRole === "object_only" ||
    ["environment_broll", "product_broll", "proof_broll", "transition"].includes(beat.sourceRole || "");
}

function resolveSpeechUnits(beat: ReferenceSegmentBeat, units: readonly StoryboardSpeechUnit[]) {
  const overlapping = units.filter((unit) => beat.startSeconds < unit.endSeconds && beat.endSeconds > unit.startSeconds);
  if (overlapping.length) return overlapping;
  const midpoint = (beat.startSeconds + beat.endSeconds) / 2;
  return [units.reduce((closest, unit) =>
    Math.abs((unit.startSeconds + unit.endSeconds) / 2 - midpoint) <
      Math.abs((closest.startSeconds + closest.endSeconds) / 2 - midpoint) ? unit : closest
  )];
}

function selectMergeTarget(
  beats: readonly { beat: ReferenceSegmentBeat; sourceBeatIndex: number }[],
  index: number,
) {
  const candidates = [index + 1, index - 1].filter((candidate) => candidate >= 0 && candidate < beats.length);
  return candidates.find((candidate) => beats[candidate].beat.speechMode === "on_camera") || candidates[0] || null;
}

function mergeReferenceBeats(target: ReferenceSegmentBeat, source: ReferenceSegmentBeat): ReferenceSegmentBeat {
  const speechAlignmentNote = "Speech alignment merged an internal source cut; keep one continuous visual beat across the unfinished speech unit.";
  return {
    ...target,
    startSeconds: Math.min(target.startSeconds, source.startSeconds),
    endSeconds: Math.max(target.endSeconds, source.endSeconds),
    sourceStartSeconds: Math.min(target.sourceStartSeconds, source.sourceStartSeconds),
    sourceEndSeconds: Math.max(target.sourceEndSeconds, source.sourceEndSeconds),
    adaptationRule: [target.adaptationRule, speechAlignmentNote].filter(Boolean).join(" "),
  };
}

function isFrameBoundary(value: number) {
  const framePosition = value / OMNI_STORYBOARD_SECONDS_PER_FRAME;
  return Math.abs(framePosition - Math.round(framePosition)) < 0.001;
}
