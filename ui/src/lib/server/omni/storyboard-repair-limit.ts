export const MAX_STORYBOARD_IMAGE_GENERATION_ATTEMPTS = 3;

export function canAttemptStoryboardImageGeneration(previousAttemptCount: number) {
  return Math.max(0, previousAttemptCount) < MAX_STORYBOARD_IMAGE_GENERATION_ATTEMPTS;
}

export function normalizeStoryboardImageGenerationAttemptCount(value: number | undefined) {
  const parsed = Number.isFinite(value) ? Math.floor(Number(value)) : 0;
  return Math.max(0, Math.min(MAX_STORYBOARD_IMAGE_GENERATION_ATTEMPTS, parsed));
}

export function resolveStoryboardImageGenerationAttempt(input: {
  previousAttemptCount: number;
  pendingKieTaskId?: string | null;
  usesKie: boolean;
}) {
  const previousAttemptCount = normalizeStoryboardImageGenerationAttemptCount(input.previousAttemptCount);
  const resumesPendingKieTask = input.usesKie && Boolean(input.pendingKieTaskId);
  return {
    shouldAttempt: resumesPendingKieTask || canAttemptStoryboardImageGeneration(previousAttemptCount),
    resumesPendingKieTask,
    generationAttemptCount: resumesPendingKieTask ? Math.max(1, previousAttemptCount) : previousAttemptCount + 1,
  };
}

export function withStoryboardGenerationAttemptCount(error: unknown, generationAttemptCount: number) {
  if (error && typeof error === "object") {
    (error as { storyboardGenerationAttemptCount?: number }).storyboardGenerationAttemptCount = generationAttemptCount;
  }
  return error;
}
