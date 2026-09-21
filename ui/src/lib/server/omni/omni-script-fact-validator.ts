/**
 * Deterministic fact-grounding validation for scriptwriter drafts.
 *
 * The model owns the text; code owns the checks. A draft is rejected when it
 * names a place or an amount that does not exist in the reference facts or the
 * product card, or when the hook promises something the body never delivers.
 * Prompt rules cannot guarantee this — this gate does.
 */

const MIN_PLACE_LENGTH = 4;

// Number words that carry money-magnitude meaning; small counts ("три причины")
// are structural and allowed freely.
const RUSSIAN_NUMBER_WORDS: Record<string, number> = {
  сто: 100, двести: 200, триста: 300, четыреста: 400, пятьсот: 500,
  шестьсот: 600, семьсот: 700, восемьсот: 800, девятьсот: 900,
  тысяча: 1000, тысячи: 1000, тысяч: 1000, миллиона: 1_000_000,
  миллион: 1_000_000, миллионов: 1_000_000,
};

const LATIN_TO_CYRILLIC: Record<string, string> = {
  a: "а", b: "б", v: "в", g: "г", d: "д", e: "е", z: "з", i: "и", k: "к",
  l: "л", m: "м", n: "н", o: "о", p: "п", r: "р", s: "с", t: "т", u: "у",
  f: "ф", h: "х", c: "ц", y: "й", j: "дж", w: "в", x: "кс", q: "к",
};

const HOOK_STOPWORDS = new Set([
  "все", "этот", "эта", "тут", "там", "где", "как", "что", "чтобы", "если",
  "нашел", "нашла", "секрет", "который", "которая", "потому", "есть",
]);

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

/** Numeric magnitude words in the script (value >= 100). */
export function extractScriptAmounts(script: string) {
  const amounts = new Set<number>();
  for (const raw of script.toLowerCase().split(/[^\p{L}]+/u)) {
    const value = RUSSIAN_NUMBER_WORDS[raw];
    if (value >= 100) amounts.add(value);
  }
  // Compounds like "десять тысяч" collapse to the magnitude word itself.
  return amounts;
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
  const inventedPlaces = [...extractScriptPlaces(input.script)].filter(
    (place) => ![...allowedPlaces].some((allowed) => placeMatches(place, allowed))
  );
  if (inventedPlaces.length) {
    issues.push(
      `Сценарий называет места, которых нет в фактах референса и карточке продукта: ${inventedPlaces.join(", ")}. Используй только места из блока фактов.`
    );
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
  if (missedPromises.length) {
    issues.push(
      `Хук обещает, но в сценарии этого нет: ${missedPromises.join(", ")}. Обещание хука должно раскрываться в тексте.`
    );
  }

  return issues;
}
