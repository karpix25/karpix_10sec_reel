import type { ReferenceFormatMode } from "./omni-reference-format-mode";
import type { ReferenceSceneMode } from "./omni-reference-scene-mode";

export const DIRECTOR_WARDROBE_CONTINUITIES = [
  "stable",
  "changes_between_cuts",
  "not_visible",
  "unknown",
] as const;

export type DirectorWardrobeContinuity = typeof DIRECTOR_WARDROBE_CONTINUITIES[number];

export const DIRECTOR_SUBJECT_CONTINUITIES = [
  "single_subject",
  "multiple_subjects",
  "no_visible_subject",
  "unknown",
] as const;

export type DirectorSubjectContinuity = typeof DIRECTOR_SUBJECT_CONTINUITIES[number];

export type DirectorWardrobeTimelineItem = {
  start_sec: number;
  end_sec: number;
  subject_id: string;
  visible: boolean;
  description: string;
  change_note: string;
  confidence: number;
};

export function requiresContinuousPresenterWardrobe(input: {
  referenceFormatMode?: ReferenceFormatMode;
  referenceSceneMode?: ReferenceSceneMode;
}) {
  return input.referenceFormatMode === "continuous_story" && input.referenceSceneMode === "presenter";
}

export function normalizeDirectorWardrobeContinuity(value: unknown): DirectorWardrobeContinuity | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "stable" || normalized === "same" || normalized === "fixed") return "stable";
  if (normalized === "changes_between_cuts" || normalized === "changes" || normalized === "variable") {
    return "changes_between_cuts";
  }
  if (normalized === "not_visible" || normalized === "none" || normalized === "not_applicable") {
    return "not_visible";
  }
  if (normalized === "unknown" || normalized === "unclear") return "unknown";
  return null;
}

export function normalizeDirectorSubjectContinuity(value: unknown): DirectorSubjectContinuity | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "single_subject" || normalized === "same_person" || normalized === "one_person") {
    return "single_subject";
  }
  if (normalized === "multiple_subjects" || normalized === "different_people" || normalized === "many_people") {
    return "multiple_subjects";
  }
  if (normalized === "no_visible_subject" || normalized === "no_people" || normalized === "none") {
    return "no_visible_subject";
  }
  if (normalized === "unknown" || normalized === "unclear") return "unknown";
  return null;
}

export function normalizeDirectorWardrobeTimelineItem(value: unknown): DirectorWardrobeTimelineItem | null {
  if (!isRecord(value)) return null;
  const start = numberValue(value.start_sec ?? value.start_seconds ?? value.timestamp_start_sec);
  const end = numberValue(value.end_sec ?? value.end_seconds ?? value.timestamp_end_sec, start);
  const description = textValue(value.description ?? value.wardrobe ?? value.clothing);
  const visible = typeof value.visible === "boolean" ? value.visible : Boolean(description);
  if (!description && visible) return null;
  return {
    start_sec: Math.max(0, start),
    end_sec: Math.max(Math.max(0, start), end),
    subject_id: textValue(value.subject_id ?? value.subjectId) || "primary_subject",
    visible,
    description,
    change_note: textValue(value.change_note ?? value.changeNote),
    confidence: Math.max(0, Math.min(1, numberValue(value.confidence, 0))),
  };
}

export function selectDirectorWardrobeTimelineItem(
  items: readonly DirectorWardrobeTimelineItem[],
  targetTime: number,
) {
  if (!items.length) return null;
  return items.find((item) => item.start_sec <= targetTime && targetTime <= item.end_sec) ||
    items.reduce((best, item) =>
      Math.abs((item.start_sec + item.end_sec) / 2 - targetTime) <
      Math.abs((best.start_sec + best.end_sec) / 2 - targetTime)
        ? item
        : best
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function numberValue(value: unknown, fallback = 0) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}
