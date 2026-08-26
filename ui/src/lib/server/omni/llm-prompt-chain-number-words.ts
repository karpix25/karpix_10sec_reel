const ONES = [
  "ноль",
  "один",
  "два",
  "три",
  "четыре",
  "пять",
  "шесть",
  "семь",
  "восемь",
  "девять",
];

const ONES_GENITIVE = [
  "ноля",
  "одного",
  "двух",
  "трех",
  "четырех",
  "пяти",
  "шести",
  "семи",
  "восьми",
  "девяти",
];

const TEENS = [
  "десять",
  "одиннадцать",
  "двенадцать",
  "тринадцать",
  "четырнадцать",
  "пятнадцать",
  "шестнадцать",
  "семнадцать",
  "восемнадцать",
  "девятнадцать",
];

const TEENS_GENITIVE = [
  "десяти",
  "одиннадцати",
  "двенадцати",
  "тринадцати",
  "четырнадцати",
  "пятнадцати",
  "шестнадцати",
  "семнадцати",
  "восемнадцати",
  "девятнадцати",
];

const TENS = [
  "",
  "",
  "двадцать",
  "тридцать",
  "сорок",
  "пятьдесят",
  "шестьдесят",
  "семьдесят",
  "восемьдесят",
  "девяносто",
];

const TENS_GENITIVE = [
  "",
  "",
  "двадцати",
  "тридцати",
  "сорока",
  "пятидесяти",
  "шестидесяти",
  "семидесяти",
  "восьмидесяти",
  "девяноста",
];

const HUNDREDS = [
  "",
  "сто",
  "двести",
  "триста",
  "четыреста",
  "пятьсот",
  "шестьсот",
  "семьсот",
  "восемьсот",
  "девятьсот",
];

const HUNDREDS_GENITIVE = [
  "",
  "ста",
  "двухсот",
  "трехсот",
  "четырехсот",
  "пятисот",
  "шестисот",
  "семисот",
  "восьмисот",
  "девятисот",
];

export function formatPromptChainNumber(value: number): string {
  const rounded = Math.round(value);
  if (!Number.isFinite(rounded) || rounded < 0 || rounded > 999_999_999) return "заданное количество";
  if (rounded >= 1_000_000) {
    const millions = Math.floor(rounded / 1_000_000);
    return joinWords([
      formatBelowThousand(millions),
      pluralize(millions, "миллион", "миллиона", "миллионов"),
      formatPromptChainNumber(rounded % 1_000_000),
    ]);
  }
  if (rounded >= 1_000) {
    const thousands = Math.floor(rounded / 1_000);
    return joinWords([
      formatBelowThousand(thousands, true),
      pluralize(thousands, "тысяча", "тысячи", "тысяч"),
      formatBelowThousand(rounded % 1_000),
    ]);
  }
  return formatBelowThousand(rounded);
}

export function spellPromptChainNumbersInText(value: string) {
  const rangeAwareText = value
    .replace(/(^|\s)от\s+(\+?\d{1,3}(?:[\u00A0\u202F ]\d{3})*)\s+до\s+(\+?\d{1,3}(?:[\u00A0\u202F ]\d{3})*)/giu, (_match, prefix, min, max) =>
      `${prefix}${formatSpokenRange(min, max)}`)
    .replace(/(?<!\d)(\+?\d{1,3}(?:[\u00A0\u202F ]\d{3})*)\s*[-‐‑‒–—―−]\s*(\+?\d{1,3}(?:[\u00A0\u202F ]\d{3})*)(?!\d)/gu, (_match, min, max) =>
      formatSpokenRange(min, max));

  return rangeAwareText.replace(/\+?\d+(?:[\u00A0\u202F ]\d{3})*/gu, spellPromptChainNumber);
}

function spellPromptChainNumber(match: string) {
  const positive = match.startsWith("+");
  const number = Number(match.replace(/[+\s\u00A0\u202F]/gu, ""));
  if (!Number.isSafeInteger(number) || number > 999_999_999) return match;
  return `${positive ? "плюс " : ""}${formatPromptChainNumber(number)}`;
}

function formatSpokenRange(minText: string, maxText: string) {
  const min = parsePromptChainNumber(minText);
  const max = parsePromptChainNumber(maxText);
  if (min === null || max === null) return `от ${minText} до ${maxText}`;
  if (min <= 999 && max <= 999) return formatPromptChainRange(min, max);
  return `от ${spellPromptChainNumber(minText)} до ${spellPromptChainNumber(maxText)}`;
}

function parsePromptChainNumber(value: string) {
  const number = Number(value.replace(/[+\s\u00A0\u202F]/gu, ""));
  return Number.isSafeInteger(number) && number <= 999_999_999 ? number : null;
}

function formatBelowThousand(value: number, feminine = false): string {
  const rounded = Math.round(value);
  if (rounded < 10) return renderOnes(rounded, feminine);
  if (rounded < 20) return TEENS[rounded - 10];
  if (rounded < 100) return joinWords([TENS[Math.floor(rounded / 10)], renderOnes(rounded % 10, feminine)]);
  return joinWords([
    HUNDREDS[Math.floor(rounded / 100)],
    formatBelowThousand(rounded % 100, feminine),
  ]);
}

export function formatPromptChainRange(min: number, max: number): string {
  const minText = formatPromptChainNumber(min);
  const maxText = formatPromptChainNumber(max);
  if (minText === maxText) return `ровно ${minText}`;
  return `от ${formatPromptChainRangeNumber(min)} до ${formatPromptChainRangeNumber(max)}`;
}

function formatPromptChainRangeNumber(value: number): string {
  const rounded = Math.round(value);
  if (!Number.isFinite(rounded) || rounded < 0 || rounded > 999) return "заданного количества";
  if (rounded < 10) return ONES_GENITIVE[rounded];
  if (rounded < 20) return TEENS_GENITIVE[rounded - 10];
  if (rounded < 100) return joinWords([TENS_GENITIVE[Math.floor(rounded / 10)], ONES_GENITIVE[rounded % 10]]);
  return joinWords([
    HUNDREDS_GENITIVE[Math.floor(rounded / 100)],
    formatPromptChainRangeNumber(rounded % 100),
  ]);
}

function joinWords(words: readonly string[]) {
  return words.filter((word) => word && word !== "ноль" && word !== "ноля").join(" ");
}

function renderOnes(value: number, feminine: boolean) {
  if (feminine && value === 1) return "одна";
  if (feminine && value === 2) return "две";
  return ONES[value];
}

function pluralize(value: number, one: string, few: string, many: string) {
  const lastHundred = value % 100;
  if (lastHundred >= 11 && lastHundred <= 14) return many;
  const last = value % 10;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}
