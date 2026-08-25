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
  /(?:^|[^\p{L}])я\s+(?!сначала(?=$|[^\p{L}]))[\p{L}]+ла(?=$|[^\p{L}])/giu,
  /(?:^|[^\p{L}])я\s+[\p{L}]+лась(?=$|[^\p{L}])/giu,
  /(?:^|[^\p{L}])я\s+(?:готова|уверена|рада|должна|вынуждена|согласна|спокойна)(?=$|[^\p{L}])/giu,
] as const;

const FEMALE_CONTEXT_PATTERNS = [
  /(?:^|[^\p{L}])(?:я\s+)?мама(?=$|[^\p{L}])/giu,
  /(?:^|[^\p{L}])мне\s+как\s+маме(?=$|[^\p{L}])/giu,
  /(?:^|[^\p{L}])(?:девочки|мы\s+девушки|мы\s+девочки)(?=$|[^\p{L}])/giu,
  /(?:^|[^\p{L}])(?:мой\s+)?макияж(?=$|[^\p{L}])/giu,
] as const;

const MALE_CONTEXT_PATTERNS = [
  /(?:^|[^\p{L}])(?:я\s+)?(?:папа|отец)(?=$|[^\p{L}])/giu,
  /(?:^|[^\p{L}])мне\s+как\s+(?:папе|отцу)(?=$|[^\p{L}])/giu,
  /(?:^|[^\p{L}])(?:парни|мужики|мы\s+мужчины|мы\s+мужики)(?=$|[^\p{L}])/giu,
] as const;

// ponytail: finite first-person morphology; unknown irregular forms stay on targeted LLM repair.
const MALE_IRREGULAR_FORMS: Readonly<Record<string, string>> = {
  нашла: "нашел",
  пошла: "пошел",
  пришла: "пришел",
  ушла: "ушел",
  зашла: "зашел",
  вошла: "вошел",
  перешла: "перешел",
  взяла: "взял",
  дала: "дал",
  стала: "стал",
  смогла: "смог",
  могла: "мог",
  хотела: "хотел",
  начала: "начал",
};

const FEMALE_IRREGULAR_FORMS: Readonly<Record<string, string>> = {
  нашел: "нашла",
  пошел: "пошла",
  пришел: "пришла",
  ушел: "ушла",
  зашел: "зашла",
  вошел: "вошла",
  перешел: "перешла",
  взял: "взяла",
  дал: "дала",
  стал: "стала",
  смог: "смогла",
  мог: "могла",
  хотел: "хотела",
  начал: "начала",
};

const MALE_ADJECTIVE_FORMS: Readonly<Record<string, string>> = {
  готова: "готов",
  уверена: "уверен",
  рада: "рад",
  должна: "должен",
  вынуждена: "вынужден",
  согласна: "согласен",
  спокойна: "спокоен",
};

const FEMALE_ADJECTIVE_FORMS: Readonly<Record<string, string>> = {
  готов: "готова",
  уверен: "уверена",
  рад: "рада",
  должен: "должна",
  вынужден: "вынуждена",
  согласен: "согласна",
  спокоен: "спокойна",
};

export function renderRussianSpeechGenderRule(gender: OmniAvatarSpeechGender) {
  if (gender === "male") {
    return [
      "Грамматический род говорящего: мужской.",
      "Все фразы от первого лица должны быть в мужском роде: я заметил, я понял, я попробовал, я готов.",
      "Не используй женские формы от лица персонажа: я заметила, я поняла, я попробовала, я готова.",
      "Если reference был от женщины, адаптируй женские бытовые маркеры под мужского аватара: не переноси слова девочки, девушки, мама, мой макияж.",
    ].join(" ");
  }
  return [
    "Грамматический род говорящего: женский.",
    "Все фразы от первого лица должны быть в женском роде: я заметила, я поняла, я попробовала, я готова.",
    "Не используй мужские формы от лица персонажа: я заметил, я понял, я попробовал, я готов.",
    "Если reference был от мужчины, адаптируй мужские бытовые маркеры под женского аватара: не переноси слова парни, мужики, папа, отец.",
  ].join(" ");
}

export function validateRussianSpeechGender(
  text: string,
  expectedGender: OmniAvatarSpeechGender
): RussianSpeechGenderIssue[] {
  const forbiddenPatterns = expectedGender === "male"
    ? [...FEMALE_FORM_PATTERNS, ...FEMALE_CONTEXT_PATTERNS]
    : [...MALE_FORM_PATTERNS, ...MALE_CONTEXT_PATTERNS];
  return forbiddenPatterns.flatMap((pattern) => collectMatches(text, pattern, expectedGender));
}

export function normalizeRussianSpeechGender(
  text: string,
  expectedGender: OmniAvatarSpeechGender
) {
  const forms = expectedGender === "male"
    ? { irregular: MALE_IRREGULAR_FORMS, adjectives: MALE_ADJECTIVE_FORMS }
    : { irregular: FEMALE_IRREGULAR_FORMS, adjectives: FEMALE_ADJECTIVE_FORMS };

  return text.replace(
    /(^|[^\p{L}])(я)(\s+)([\p{L}]+)/giu,
    (match, boundary: string, pronoun: string, whitespace: string, word: string) => {
      const lowerWord = word.toLocaleLowerCase("ru-RU");
      if (lowerWord === "сначала") return match;
      const replacement = forms.irregular[lowerWord]
        || forms.adjectives[lowerWord]
        || normalizeRegularFirstPersonForm(lowerWord, expectedGender);
      if (!replacement || replacement === lowerWord) return match;
      return `${boundary}${pronoun}${whitespace}${wordCase(replacement, word)}`;
    }
  );
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

function normalizeRegularFirstPersonForm(word: string, expectedGender: OmniAvatarSpeechGender) {
  if (expectedGender === "male") {
    if (word.endsWith("лась")) return `${word.slice(0, -4)}лся`;
    if (word.endsWith("ла")) return word.slice(0, -1);
    return null;
  }
  if (word.endsWith("лся")) return `${word.slice(0, -3)}лась`;
  if (word.endsWith("л")) return `${word}а`;
  return null;
}

function wordCase(value: string, source: string) {
  if (source === source.toLocaleUpperCase("ru-RU")) return value.toLocaleUpperCase("ru-RU");
  if (source[0] === source[0]?.toLocaleUpperCase("ru-RU")) {
    return `${value[0]?.toLocaleUpperCase("ru-RU") || ""}${value.slice(1)}`;
  }
  return value;
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
