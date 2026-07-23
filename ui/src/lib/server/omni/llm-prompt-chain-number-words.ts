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
  if (!Number.isFinite(rounded) || rounded < 0 || rounded > 999) return "заданное количество";
  if (rounded < 10) return ONES[rounded];
  if (rounded < 20) return TEENS[rounded - 10];
  if (rounded < 100) return joinWords([TENS[Math.floor(rounded / 10)], ONES[rounded % 10]]);
  return joinWords([
    HUNDREDS[Math.floor(rounded / 100)],
    formatPromptChainNumber(rounded % 100),
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
