/**
 * Deterministic fact-grounding validation for scriptwriter drafts.
 *
 * The model owns the text; code owns the checks. A draft is rejected when it
 * names a place or an amount that does not exist in the reference facts or the
 * product card, or when the hook promises something the body never delivers.
 * Prompt rules cannot guarantee this — this gate does.
 */

const MIN_PLACE_LENGTH = 4;

const LATIN_TO_CYRILLIC: Record<string, string> = {
  a: "а", b: "б", v: "в", g: "г", d: "д", e: "е", z: "з", i: "и", k: "к",
  l: "л", m: "м", n: "н", o: "о", p: "п", r: "р", s: "с", t: "т", u: "у",
  f: "ф", h: "х", c: "ц", y: "й", j: "дж", w: "в", x: "кс", q: "к",
};

const HOOK_STOPWORDS = new Set([
  "все", "этот", "эта", "тут", "там", "где", "как", "что", "чтобы", "если",
  "нашел", "нашла", "секрет", "который", "которая", "потому", "есть",
]);

// Composable Russian number words: units, tens, hundreds and magnitudes.
const RUSSIAN_NUMBER_UNITS: Record<string, number> = {
  один: 1, одна: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6,
  семь: 7, восемь: 8, девять: 9, десять: 10, одиннадцать: 11, двенадцать: 12,
  тринадцать: 13, четырнадцать: 14, пятнадцать: 15, шестнадцать: 16,
  семнадцать: 17, восемнадцать: 18, девятнадцать: 19, двадцать: 20,
  тридцать: 30, сорок: 40, пятьдесят: 50, шестьдесят: 60, семьдесят: 70,
  восемьдесят: 80, девяносто: 90,
};
const RUSSIAN_NUMBER_HUNDREDS: Record<string, number> = {
  сто: 100, двести: 200, триста: 300, четыреста: 400, пятьсот: 500,
  шестьсот: 600, семьсот: 700, восемьсот: 800, девятьсот: 900,
};
const RUSSIAN_NUMBER_MAGNITUDES: Record<string, number> = {
  тысяча: 1000, тысячи: 1000, тысяч: 1000,
  миллион: 1_000_000, миллиона: 1_000_000, миллионов: 1_000_000,
};

export type FactGroundingInput = {
  script: string;
  hook: string;
  facts: string[];
  productCardText: string;
};

export type FactGroundingIssues = string[];

function transliterateLatinWord(word: string) {
  return word
    .toLowerCase()
    .split("")
    .map((char) => LATIN_TO_CYRILLIC[char] ?? char)
    .join("");
}

function normalizeToken(token: string) {
  return token.replace(/[^\p{L}\p{N}-]/gu, "");
}

/** Proper nouns from fact strings and the product card, in both alphabets. */
export function collectAllowedPlaces(sources: string[]) {
  const allowed = new Set<string>();
  for (const source of sources) {
    for (const raw of source.split(/[^\p{L}\p{N}-]+/u)) {
      const token = normalizeToken(raw);
      if (token.length < MIN_PLACE_LENGTH) continue;
      const first = raw[0];
      if (first !== first.toUpperCase() || first === first.toLowerCase()) continue;
      allowed.add(token.toLowerCase());
      if (/^[a-z-]+$/i.test(token)) allowed.add(transliterateLatinWord(token));
    }
    // Capitalized multiword subjects ("Langkawi, Malaysia") also admit each part.
  }
  return allowed;
}

/** Capital-letter tokens in the script that are not sentence-initial. */
export function extractScriptPlaces(script: string) {
  const sentences = script.split(/(?<=[.!?])\s+/).filter(Boolean);
  const places = new Set<string>();
  for (const sentence of sentences) {
    const words = sentence.split(/\s+/).filter(Boolean);
    words.forEach((raw, index) => {
      const token = normalizeToken(raw);
      if (token.length < MIN_PLACE_LENGTH) return;
      const first = token[0];
      if (first !== first.toUpperCase() || first === first.toLowerCase()) return;
      if (index === 0 && first === first.toUpperCase()) {
        // Sentence-initial capital can be a normal word; only flag it when the
        // same token also appears capitalized mid-sentence elsewhere.
        return;
      }
      for (const part of token.split("-").filter(Boolean)) {
        if (part.length >= MIN_PLACE_LENGTH) places.add(part.toLowerCase());
      }
    });
  }
  return places;
}

/** Numeric magnitudes in the script, including composed forms ("шестьдесят шесть тысяч"). */
export function extractScriptAmounts(script: string) {
  const amounts = new Set<number>();
  const words = script.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  let current = 0;
  const flush = (value: number) => {
    if (value >= 100) amounts.add(value);
  };
  for (const word of words) {
    const unit = RUSSIAN_NUMBER_UNITS[word];
    const hundred = RUSSIAN_NUMBER_HUNDREDS[word];
    const magnitude = RUSSIAN_NUMBER_MAGNITUDES[word];
    if (unit) {
      current = composeNumber(current, unit);
    } else if (hundred) {
      current = composeNumber(current, hundred);
    } else if (magnitude) {
      flush(Math.max(1, current) * magnitude);
      current = 0;
    } else {
      flush(current);
      current = 0;
    }
  }
  flush(current);
  return amounts;
}

function composeNumber(current: number, addend: number) {
  // "двадцать три" = 20+3; "сто двадцать" = 100+20; "сто двадцать три" = 123.
  return current + addend;
}

/** Digits mentioned anywhere in facts/product text, as allowed amount values. */
export function collectAllowedAmounts(sources: string[]) {
  const amounts = new Set<number>();
  for (const source of sources.join(" ").matchAll(/(\d[\d\s.,]*)/g)) {
    const value = Number(source[1].replace(/[\s.,](?=\d{3}\b)/g, "").replace(/[.,]\d+$/, "").replace(/[\s.,]/g, ""));
    if (Number.isFinite(value) && value >= 100) amounts.add(value);
  }
  return amounts;
}

function hookPromiseTokens(hook: string) {
  return [...new Set(
    hook
      .toLowerCase()
      .split(/[^\p{L}\p{N}-]+/u)
      .map((word) => word.replace(/^-|-$/g, ""))
      .filter((word) => word.length >= 5 && !HOOK_STOPWORDS.has(word))
  )];
}

/** All lowercase source tokens (any case) — product-context words like "российские" allow "России". */
function collectSourceTokens(sources: string[]) {
  const tokens = new Set<string>();
  for (const source of sources) {
    for (const raw of source.split(/[^\p{L}\p{N}-]+/u)) {
      const token = normalizeToken(raw);
      if (token.length >= MIN_PLACE_LENGTH) tokens.add(token.toLowerCase());
    }
  }
  return tokens;
}

const PLACE_PREFIX_LENGTH = 5;

/** Prefix match tolerant to Russian declensions ("Малайзии" vs "Малайсиа"). */
function placeMatches(scriptPlace: string, allowedPlace: string) {
  const prefixLength = Math.min(PLACE_PREFIX_LENGTH, scriptPlace.length, allowedPlace.length);
  return scriptPlace.slice(0, prefixLength) === allowedPlace.slice(0, prefixLength);
}

export function validateScriptFactGrounding(input: FactGroundingInput): FactGroundingIssues {
  const issues: string[] = [];
  const allowedSources = [...input.facts, input.productCardText];

  const allowedPlaces = collectAllowedPlaces(allowedSources);
  const allowedSourceTokens = collectSourceTokens(allowedSources);
  const factPlaces = collectAllowedPlaces(input.facts);
  const scriptPlaces = extractScriptPlaces(input.script);
  const inventedPlaces = [...scriptPlaces].filter(
    (place) =>
      ![...allowedPlaces].some((allowed) => placeMatches(place, allowed)) &&
      ![...allowedSourceTokens].some((token) => placeMatches(place, token))
  );
  if (inventedPlaces.length) {
    issues.push(
      `Сценарий называет места, которых нет в фактах референса и карточке продукта: ${inventedPlaces.join(", ")}. Используй только места из блока фактов.`
    );
  }

  // Positive requirement: when the facts name a concrete subject (place), the
  // script must use it — otherwise the model dodges into vague wording.
  if (factPlaces.size > 0) {
    const scriptTokens = input.script.toLowerCase().split(/[^\p{L}\p{N}-]+/u).filter(Boolean);
    const mentionsFactPlace = [...factPlaces].some((allowed) =>
      scriptTokens.some((token) => placeMatches(token, allowed)) ||
      [...scriptPlaces].some((place) => placeMatches(place, allowed))
    );
    if (!mentionsFactPlace) {
      issues.push(
        "Факты референса называют конкретное место — сценарий обязан его назвать. Не уходи в расплывчатые формулировки."
      );
    }
  }

  const allowedAmounts = collectAllowedAmounts(allowedSources);
  const inventedAmounts = [...extractScriptAmounts(input.script)].filter(
    (amount) => !allowedAmounts.has(amount)
  );
  if (inventedAmounts.length) {
    issues.push(
      `Сценарий называет суммы, которых нет в фактах: ${inventedAmounts.join(", ")}. Суммы бери только из блока фактов дословно.`
    );
  }

  const body = input.script.toLowerCase();
  const missedPromises = hookPromiseTokens(input.hook).filter((token) => !body.includes(token));
  // One rephrased word is normal style variation; flag only real payoff gaps.
  if (missedPromises.length > 1) {
    issues.push(
      `Хук обещает, но в сценарии этого нет: ${missedPromises.join(", ")}. Обещание хука должно раскрываться в тексте.`
    );
  }

  return issues;
}
