import type { OmniAvatarSpeechGender } from "../../omni/avatar-speech-gender";
import { getAvatarSpeechGenderLabel } from "../../omni/avatar-speech-gender";

export type RussianSpeechGenderIssue = {
  expectedGender: OmniAvatarSpeechGender;
  matchedText: string;
  snippet: string;
};

const MALE_FORM_PATTERNS = [
  /(?:^|[^\p{L}])я\s+[\p{L}]+л(?=$|[^\p{L}])/giu,
  /(?:^|[^\p{L}])я\s+[\p{L}]+лся(?=$|[^\p{L}])/giu,
  /(?:^|[^\p{L}])я\s+(?:готов|уверен|рад|должен|вынужден|согласен|спокоен)(?=$|[^\p{L}])/giu,
] as const;

const FEMALE_FORM_PATTERNS = [
  /(?:^|[^\p{L}])я\s+[\p{L}]+ла(?=$|[^\p{L}])/giu,
  /(?:^|[^\p{L}])я\s+[\p{L}]+лась(?=$|[^\p{L}])/giu,
  /(?:^|[^\p{L}])я\s+(?:готова|уверена|рада|должна|вынуждена|согласна|спокойна)(?=$|[^\p{L}])/giu,
] as const;

export function renderRussianSpeechGenderRule(gender: OmniAvatarSpeechGender) {
  if (gender === "male") {
    return [
      "Грамматический род говорящего: мужской.",
      "Все фразы от первого лица должны быть в мужском роде: я заметил, я понял, я попробовал, я готов.",
      "Не используй женские формы от лица персонажа: я заметила, я поняла, я попробовала, я готова.",
    ].join(" ");
  }
  return [
    "Грамматический род говорящего: женский.",
    "Все фразы от первого лица должны быть в женском роде: я заметила, я поняла, я попробовала, я готова.",
    "Не используй мужские формы от лица персонажа: я заметил, я понял, я попробовал, я готов.",
  ].join(" ");
}

export function validateRussianSpeechGender(
  text: string,
  expectedGender: OmniAvatarSpeechGender
): RussianSpeechGenderIssue[] {
  const forbiddenPatterns = expectedGender === "male" ? FEMALE_FORM_PATTERNS : MALE_FORM_PATTERNS;
  return forbiddenPatterns.flatMap((pattern) => collectMatches(text, pattern, expectedGender));
}

export function assertRussianSpeechGender(text: string, expectedGender: OmniAvatarSpeechGender) {
  const issues = validateRussianSpeechGender(text, expectedGender);
  if (!issues.length) return;
  const label = getAvatarSpeechGenderLabel(expectedGender);
  const examples = issues
    .slice(0, 5)
    .map((issue) => `"${issue.matchedText}"`)
    .join(", ");
  throw new Error(`Russian speech gender mismatch: expected ${label} род, found ${examples}`);
}

function collectMatches(
  text: string,
  pattern: RegExp,
  expectedGender: OmniAvatarSpeechGender
): RussianSpeechGenderIssue[] {
  const issues: RussianSpeechGenderIssue[] = [];
  pattern.lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const matchedText = match[0]?.trim();
    if (!matchedText) continue;
    issues.push({
      expectedGender,
      matchedText,
      snippet: buildSnippet(text, match.index || 0, matchedText.length),
    });
  }
  return issues;
}

function buildSnippet(text: string, index: number, length: number) {
  const start = Math.max(0, index - 30);
  const end = Math.min(text.length, index + length + 30);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}
