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
  return value.replace(/\+?\d(?:[\d\u00A0\u202F ]*\d)?/gu, (match) => {
    const positive = match.startsWith("+");
    const number = Number(match.replace(/[+\s\u00A0\u202F]/gu, ""));
    if (!Number.isSafeInteger(number) || number > 999_999_999) return match;
    return `${positive ? "плюс " : ""}${formatPromptChainNumber(number)}`;
  });
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
