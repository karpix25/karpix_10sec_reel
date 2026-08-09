const PERMANENT_ERROR_PATTERNS = [
  /Сценарий не помещается в доступные Omni-длительности/iu,
  /Generated script not found/iu,
  /Omni project not found/iu,
  /Omni reel has no segments/iu,
  /requires an approved avatar/iu,
  /requires (?:an|the) avatar reference/iu,
  /requires a canonical product image/iu,
  /physical preflight/iu,
  /Invalid Omni storyboard/iu,
  /Omni segment prompts leak neighbor speech/iu,
  /belongs to another Omni project/iu,
  /Director analysis .* (?:is missing|is for legacy reference)/iu,
  /Production preflight blocked: (?:.*not found|.*requires an approved avatar|OPENROUTER_API_KEY.*not configured|compacted script did not pass|script compaction returned empty)/iu,
];

export function shouldRetryOmniAutomationError(message: string) {
  return !PERMANENT_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}
