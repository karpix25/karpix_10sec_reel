const RETRYABLE_REFERENCE_ERROR_PATTERNS = [
  /ScrapeCreators Instagram post failed:\s*402\b/iu,
  /Instagram video resolution failed[.:].*ScrapeCreators:.*402\b/iu,
];

export function isRetryableDirectorAnalysisError(error: string | null | undefined) {
  const message = error?.trim();
  return Boolean(message && RETRYABLE_REFERENCE_ERROR_PATTERNS.some((pattern) => pattern.test(message)));
}
