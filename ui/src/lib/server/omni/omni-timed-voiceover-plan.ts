import type { OmniDurationRange } from "./omni-duration-range";
import {
  hasCompletedSentenceBoundary,
  normalizeScriptText,
  type VoiceSegment,
} from "./omni-script-segmentation";
import { planOmniReelSegments, type OmniReelSegmentPlan } from "./omni-duration-planner";
import {
  OMNI_STORYBOARD_MAX_FRAME_WORDS,
  OMNI_STORYBOARD_MIN_FRAME_WORDS,
  getOmniStoryboardFrameWordCounts,
  isOmniStoryboardDuration,
} from "../../omni/storyboard/omni-storyboard-timing";

export const OMNI_TIMED_VOICEOVER_PLAN_VERSION = "omni-timed-voiceover-v1" as const;

export type OmniTimedVoiceoverSegment = VoiceSegment & {
  durationSeconds: number;
  startSeconds: number;
  endSeconds: number;
  frameWordCounts: readonly number[];
};

export type OmniTimedVoiceoverPlan = {
  version: typeof OMNI_TIMED_VOICEOVER_PLAN_VERSION;
  script: string;
  segmentCount: number;
  durationSeconds: number;
  wordCount: number;
  segments: readonly OmniTimedVoiceoverSegment[];
  durationRange?: OmniDurationRange;
};

export function buildOmniTimedVoiceoverPlan(
  script: string,
  options: { durationRange?: OmniDurationRange } = {}
): OmniTimedVoiceoverPlan {
  const segmentPlan = planOmniReelSegments(script, {
    durationRange: options.durationRange,
    requireSentenceBoundaries: true,
  });
  return buildOmniTimedVoiceoverPlanFromSegments(segmentPlan, options.durationRange);
}

export function resolveOmniTimedVoiceoverPlan(input: {
  script: string;
  sourceSnapshot?: unknown;
  durationRange?: OmniDurationRange;
}): OmniTimedVoiceoverPlan {
  const stored = readOmniTimedVoiceoverPlan(input.sourceSnapshot);
  if (stored) {
    assertOmniTimedVoiceoverPlanMatchesScript(stored, input.script);
    return stored;
  }
  return buildOmniTimedVoiceoverPlan(input.script, { durationRange: input.durationRange });
}

export function readOmniTimedVoiceoverPlan(snapshot: unknown): OmniTimedVoiceoverPlan | null {
  const source = asRecord(snapshot);
  const raw = source?.timed_voiceover_plan ?? source?.timedVoiceoverPlan;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return normalizeTimedPlan(raw as Record<string, unknown>);
}

export function assertOmniTimedVoiceoverPlanMatchesScript(
  plan: OmniTimedVoiceoverPlan,
  script: string
) {
  const expectedScript = normalizeScriptText(script);
  if (
    !Number.isInteger(plan.segmentCount) ||
    plan.segmentCount < 1 ||
    plan.segmentCount > 5 ||
    !Number.isInteger(plan.wordCount) ||
    plan.wordCount !== countWords(expectedScript) ||
    !Number.isFinite(plan.durationSeconds) ||
    plan.durationSeconds <= 0
  ) {
    throw new Error("Timed voiceover plan metadata is invalid");
  }
  if (plan.segments.length !== plan.segmentCount) {
    throw new Error("Timed voiceover plan segment count does not match its segments");
  }
  if (plan.script !== expectedScript) {
    throw new Error("Timed voiceover plan does not match the current script");
  }
  if (reconstructTimedVoiceoverPlan(plan) !== expectedScript) {
    throw new Error("Timed voiceover plan loses or duplicates script words");
  }
  let expectedStartSeconds = 0;
  for (const [index, segment] of plan.segments.entries()) {
    const expectedFrameWordCounts = getOmniStoryboardFrameWordCounts(segment.wordCount, segment.durationSeconds);
    if (
      segment.index !== index + 1 ||
      segment.wordCount !== countWords(segment.text) ||
      segment.startSeconds !== expectedStartSeconds ||
      segment.endSeconds !== expectedStartSeconds + segment.durationSeconds ||
      !expectedFrameWordCounts ||
      expectedFrameWordCounts.join(",") !== segment.frameWordCounts.join(",")
    ) {
      throw new Error(`Timed voiceover segment ${segment.index} timing metadata is invalid`);
    }
    if (index < plan.segments.length - 1 && !hasCompletedSentenceBoundary(segment.text)) {
      throw new Error(`Timed voiceover segment ${segment.index} ends before a complete sentence`);
    }
    expectedStartSeconds = segment.endSeconds;
  }
  if (expectedStartSeconds !== plan.durationSeconds) throw new Error("Timed voiceover plan duration is invalid");
}

export function reconstructTimedVoiceoverPlan(plan: OmniTimedVoiceoverPlan) {
  return normalizeScriptText(plan.segments.map((segment) => segment.text).join(" "));
}

export function buildOmniTimedVoiceoverPlanFromSegments(segmentPlan: OmniReelSegmentPlan, durationRange?: OmniDurationRange): OmniTimedVoiceoverPlan {
  let startSeconds = 0;
  const segments = segmentPlan.segments.map((segment, index) => {
    const durationSeconds = segmentPlan.segmentDurationsSeconds[index];
    const frameWordCounts = getOmniStoryboardFrameWordCounts(segment.wordCount, durationSeconds);
    if (!frameWordCounts) throw new Error(`Segment ${segment.index} cannot be mapped to storyboard frames`);
    const timedSegment = {
      ...segment,
      durationSeconds,
      startSeconds,
      endSeconds: startSeconds + durationSeconds,
      frameWordCounts,
    };
    startSeconds += durationSeconds;
    return timedSegment;
  });
  const plan: OmniTimedVoiceoverPlan = {
    version: OMNI_TIMED_VOICEOVER_PLAN_VERSION,
    script: normalizeScriptText(segmentPlan.segments.map((segment) => segment.text).join(" ")),
    segmentCount: segments.length,
    durationSeconds: startSeconds,
    wordCount: segmentPlan.wordCount,
    segments,
    durationRange,
  };
  assertOmniTimedVoiceoverPlanMatchesScript(plan, plan.script);
  return plan;
}

function normalizeTimedPlan(raw: Record<string, unknown>): OmniTimedVoiceoverPlan {
  if (raw.version !== OMNI_TIMED_VOICEOVER_PLAN_VERSION) throw new Error("Unknown timed plan version");
  const segments = Array.isArray(raw.segments) ? raw.segments.map(normalizeSegment) : [];
  const plan = {
    version: OMNI_TIMED_VOICEOVER_PLAN_VERSION,
    script: normalizeScriptText(String(raw.script || "")),
    segmentCount: Number(raw.segmentCount),
    durationSeconds: Number(raw.durationSeconds),
    wordCount: Number(raw.wordCount),
    segments,
  } satisfies OmniTimedVoiceoverPlan;
  if (!plan.script || plan.segmentCount !== segments.length || !segments.length) throw new Error("Invalid timed plan");
  if (plan.durationSeconds !== segments[segments.length - 1].endSeconds) throw new Error("Invalid timed plan duration");
  assertOmniTimedVoiceoverPlanMatchesScript(plan, plan.script);
  return plan;
}

function normalizeSegment(raw: unknown): OmniTimedVoiceoverSegment {
  const source = asRecord(raw);
  if (!source) throw new Error("Invalid timed plan segment");
  const durationSeconds = Number(source.durationSeconds);
  const startSeconds = Number(source.startSeconds);
  const endSeconds = Number(source.endSeconds);
  const text = normalizeScriptText(String(source.text || ""));
  const frameWordCounts = Array.isArray(source.frameWordCounts)
    ? source.frameWordCounts.map(Number)
    : [];
  if (
    Number(source.index) < 1 || !text || !isOmniStoryboardDuration(durationSeconds) ||
    !Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds - startSeconds !== durationSeconds ||
    !frameWordCounts.length || frameWordCounts.some((count) => !Number.isInteger(count) || count < OMNI_STORYBOARD_MIN_FRAME_WORDS || count > OMNI_STORYBOARD_MAX_FRAME_WORDS)
  ) throw new Error("Invalid timed plan segment");
  return {
    index: Number(source.index),
    text,
    wordCount: Number(source.wordCount),
    durationSeconds,
    startSeconds,
    endSeconds,
    frameWordCounts,
  };
}

function countWords(text: string) {
  return text.split(/\s+/u).filter(Boolean).length;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
