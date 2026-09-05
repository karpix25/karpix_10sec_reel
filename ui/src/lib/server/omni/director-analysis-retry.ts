const PROVIDER_ACCESS_ERROR = /(?:Director analysis (?:model request|frame verification) failed|(?:ScrapeCreators|RapidAPI) Instagram post failed|ScrapeCreators|RapidAPI fallback):\s*(401|402|403)\b/iu;

/** Access failures belong to a provider account, not to the selected reference. */
export function classifyDirectorProviderFailure(error: string | null | undefined): "credits" | "access" | null {
  const match = error?.match(PROVIDER_ACCESS_ERROR);
  return match ? match[1] === "402" ? "credits" : "access" : null;
}

export function isRetryableDirectorAnalysisError(error: string | null | undefined) {
  // Keep these references eligible after the provider account is restored; the picker stops the current run.
  return classifyDirectorProviderFailure(error) !== null;
}
