export type GeneratedScriptPayload = {
  title?: string;
  hook?: string;
  hook_options?: unknown;
  selected_hook?: string;
  beats?: unknown;
  script?: unknown;
  caption?: string;
  cta_keyword?: string;
  lead_magnet?: string;
  background_audio_mood?: string;
};

export class JsonOutputParseError extends Error {
  readonly rawJson: string;

  constructor(message: string, rawJson: string) {
    super(message);
    this.name = "JsonOutputParseError";
    this.rawJson = rawJson;
  }
}

export function parseAndRepairJson<T = GeneratedScriptPayload>(content: string): T {
  let cleaned = content.replace(/^\uFEFF/u, "").trim();

  // 1. Strip markdown fences
  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  // 2. Extract the first balanced JSON object. This ignores prose or another
  // object after the actual answer without confusing braces inside strings.
  const extracted = extractFirstJsonObject(cleaned);
  if (!extracted.json) {
    throw new JsonOutputParseError(
      extracted.truncated ? "Model output contains truncated JSON" : "No JSON object found in script model output",
      cleaned,
    );
  }
  let jsonStr = extracted.json;

  // 3. Normalize smart quotes only when they are used as JSON string delimiters.
  // Keep smart quotes that appear inside valid JSON string values as prose.
  jsonStr = normalizeSmartQuoteDelimiters(jsonStr);

  // 4. Remove JS-style comments and trailing commas outside strings.
  jsonStr = stripJsonComments(jsonStr);
  jsonStr = removeTrailingCommas(jsonStr);

  // 5. Escape unescaped control characters inside string values.
  jsonStr = escapeControlCharactersInStrings(jsonStr);

  try {
    return JSON.parse(jsonStr) as T;
  } catch (err) {
    // 6. Try repairing single quotes if they are used as key or value delimiters
    let repaired = jsonStr;
    // Single quotes around keys: {'key': -> {"key":
    repaired = repaired.replace(/([{,]\s*)'([^']*)'(\s*:)/g, '$1"$2"$3');
    // Single quotes around string values: : 'value' -> : "value"
    repaired = repaired.replace(/(:\s*)'([^']*)'(\s*[,}])/g, '$1"$2"$3');
    repaired = insertMissingValueCommas(repaired);

    try {
      return JSON.parse(repaired) as T;
    } catch {
      throw new JsonOutputParseError(
        `Failed to parse script JSON: ${(err as Error).message}. Repaired raw string was: ${jsonStr}`,
        jsonStr
      );
    }
  }
}

function extractFirstJsonObject(value: string): { json: string | null; truncated: boolean } {
  const start = value.indexOf("{");
  if (start < 0) return { json: null, truncated: false };
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{" || char === "[") stack.push(char);
    else if (char === "}" || char === "]") {
      const expected = char === "}" ? "{" : "[";
      if (stack.at(-1) !== expected) return { json: null, truncated: false };
      stack.pop();
      if (!stack.length) return { json: value.slice(start, index + 1), truncated: false };
    }
  }
  return { json: null, truncated: stack.length > 0 || inString };
}

function stripJsonComments(value: string) {
  let result = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1];
    if (inString) {
      result += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      result += char;
      continue;
    }
    if (char === "/" && next === "/") {
      index += 2;
      while (index < value.length && value[index] !== "\n") index += 1;
      result += "\n";
      continue;
    }
    if (char === "/" && next === "*") {
      index += 2;
      while (index < value.length && !(value[index] === "*" && value[index + 1] === "/")) index += 1;
      index += 1;
      continue;
    }
    result += char;
  }
  return result;
}

function removeTrailingCommas(value: string) {
  let result = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (inString) {
      result += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      result += char;
      continue;
    }
    if (char === ",") {
      let cursor = index + 1;
      while (cursor < value.length && /\s/u.test(value[cursor])) cursor += 1;
      if (value[cursor] === "}" || value[cursor] === "]") continue;
    }
    result += char;
  }
  return result;
}

/**
 * Restores a missing comma only between adjacent JSON values outside strings.
 * It deliberately does not close truncated arrays or objects: a partial model
 * response must be retried, not silently accepted as a valid storyboard.
 */
function insertMissingValueCommas(str: string) {
  let result = "";
  let inString = false;
  let escaped = false;
  let previousSignificant = "";

  for (const char of str) {
    if (inString) {
      result += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') {
        inString = false;
        previousSignificant = char;
      }
      continue;
    }

    if (char === '"') {
      if (previousSignificant === '"' || previousSignificant === "}" || previousSignificant === "]") result += ",";
      inString = true;
      result += char;
      continue;
    }

    if (char === "{" || char === "[") {
      if (previousSignificant === "}" || previousSignificant === "]") result += ",";
      result += char;
      previousSignificant = char;
      continue;
    }

    result += char;
    if (!/\s/.test(char)) previousSignificant = char;
  }

  return result;
}

/**
 * Escapes literal newline characters within JSON double-quoted string values
 * so that standard JSON.parse doesn't throw on unescaped control characters.
 */
function escapeControlCharactersInStrings(str: string): string {
  let result = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '"' && !escaped) {
      inString = !inString;
      result += char;
    } else if (char === '\\' && inString) {
      escaped = !escaped;
      result += char;
    } else {
      if (inString && char.charCodeAt(0) < 0x20) {
        const escapes: Record<string, string> = { "\n": "\\n", "\r": "\\r", "\t": "\\t", "\b": "\\b", "\f": "\\f" };
        result += escapes[char] || `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
      } else {
        result += char;
      }
      escaped = false;
    }
  }
  return result;
}

function normalizeSmartQuoteDelimiters(str: string): string {
  let result = "";
  let inString = false;
  let escaped = false;
  let quoteKind: "double" | "smart" | null = null;

  for (const char of str) {
    if (!inString) {
      if (char === '"') {
        inString = true;
        quoteKind = "double";
        result += char;
      } else if (isSmartQuote(char)) {
        inString = true;
        quoteKind = "smart";
        result += '"';
      } else {
        result += char;
      }
      escaped = false;
      continue;
    }

    if (escaped) {
      result += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      result += char;
      escaped = true;
      continue;
    }

    if (quoteKind === "double" && char === '"') {
      inString = false;
      quoteKind = null;
      result += char;
      continue;
    }

    if (quoteKind === "smart" && isSmartQuote(char)) {
      inString = false;
      quoteKind = null;
      result += '"';
      continue;
    }

    result += char;
  }

  return result;
}

function isSmartQuote(char: string) {
  return char === "“" || char === "”" || char === "„";
}
