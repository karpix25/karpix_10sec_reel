const LONG_DASH_PATTERN = /[\u2012\u2013\u2014\u2015\u2212]/gu;
const EMOJI_PATTERN = /[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u20E3]/gu;

export function sanitizeOmniScriptText(value: string) {
  return value
    .replace(LONG_DASH_PATTERN, ", ")
    .replace(EMOJI_PATTERN, "")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/,{2,}/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasForbiddenOmniScriptSymbols(value: string) {
  LONG_DASH_PATTERN.lastIndex = 0;
  EMOJI_PATTERN.lastIndex = 0;
  return LONG_DASH_PATTERN.test(value) || EMOJI_PATTERN.test(value);
}

export function assertOmniScriptTextContract(value: string) {
  if (hasForbiddenOmniScriptSymbols(value)) {
    throw new Error("Omni script contains a long dash or emoji");
  }
}
