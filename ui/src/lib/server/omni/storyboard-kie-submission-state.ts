import { MAX_STORYBOARD_IMAGE_GENERATION_ATTEMPTS } from "./storyboard-repair-limit";

export const STORYBOARD_KIE_SUBMISSION_STALE_MS = 2 * 60 * 1000;

export type StoryboardKieSubmissionRow = {
  generationStatus: string;
  generationAttemptCount: number;
  taskId: string | null;
  lastAttemptAt: Date | string | null;
};

export type StoryboardKieSubmissionAction =
  | { kind: "submit"; generationAttemptCount: number }
  | { kind: "poll"; generationAttemptCount: number; taskId: string }
  | { kind: "wait" }
  | { kind: "stalled" }
  | { kind: "exhausted"; generationAttemptCount: number };

export class StoryboardKieSubmissionInProgressError extends Error {
  retryWithoutJobAttempt = true;

  constructor() {
    super("Storyboard submission is already in progress");
    this.name = "StoryboardKieSubmissionInProgressError";
  }
}

export class StoryboardKieSubmissionStalledError extends Error {
  constructor() {
    super("Storyboard submission did not return a KIE task ID. Stopped to prevent a duplicate paid request.");
    this.name = "StoryboardKieSubmissionStalledError";
  }
}

export function resolveStoryboardKieSubmissionAction(
  row: StoryboardKieSubmissionRow | null,
  now = Date.now()
): StoryboardKieSubmissionAction {
  if (!row) return { kind: "submit", generationAttemptCount: 1 };

  const generationAttemptCount = Math.max(0, Math.floor(Number(row.generationAttemptCount) || 0));
  const taskId = row.taskId?.trim() || null;
  if (row.generationStatus === "generating") {
    return taskId
      ? { kind: "poll", taskId, generationAttemptCount: Math.max(1, generationAttemptCount) }
      : { kind: "stalled" };
  }
  if (row.generationStatus === "submitting") {
    return isStaleSubmission(row.lastAttemptAt, now) ? { kind: "stalled" } : { kind: "wait" };
  }
  if (generationAttemptCount >= MAX_STORYBOARD_IMAGE_GENERATION_ATTEMPTS) {
    return { kind: "exhausted", generationAttemptCount };
  }
  return { kind: "submit", generationAttemptCount: generationAttemptCount + 1 };
}

function isStaleSubmission(lastAttemptAt: Date | string | null, now: number) {
  if (!lastAttemptAt) return true;
  const timestamp = new Date(lastAttemptAt).getTime();
  return !Number.isFinite(timestamp) || now - timestamp >= STORYBOARD_KIE_SUBMISSION_STALE_MS;
}
