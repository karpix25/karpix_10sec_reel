export type GeneratedScriptPayload = {
  title?: string;
  hook?: string;
  script?: unknown;
  caption?: string;
  cta_keyword?: string;
  lead_magnet?: string;
};

export function parseAndRepairJson(content: string): GeneratedScriptPayload {
  let cleaned = content.trim();

  // 1. Strip markdown fences
  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  // 2. Locate first '{' and last '}' to strip surrounding prose
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("No JSON object found in script model output");
  }

  let jsonStr = cleaned.slice(start, end + 1);

  // 3. Normalize smart quotes only when they are used as JSON string delimiters.
  // Keep smart quotes that appear inside valid JSON string values as prose.
  jsonStr = normalizeSmartQuoteDelimiters(jsonStr);

  // 4. Remove trailing commas in objects and arrays
  jsonStr = jsonStr.replace(/,\s*([}\]])/g, "$1");

  // 5. Escape unescaped newlines inside double-quoted string values
  jsonStr = escapeNewlinesInStrings(jsonStr);

  try {
    return JSON.parse(jsonStr) as GeneratedScriptPayload;
  } catch (err) {
    // 6. Try repairing single quotes if they are used as key or value delimiters
    let repaired = jsonStr;
    // Single quotes around keys: {'key': -> {"key":
    repaired = repaired.replace(/([{,]\s*)'([^']*)'(\s*:)/g, '$1"$2"$3');
    // Single quotes around string values: : 'value' -> : "value"
    repaired = repaired.replace(/(:\s*)'([^']*)'(\s*[,}])/g, '$1"$2"$3');

    try {
      return JSON.parse(repaired) as GeneratedScriptPayload;
    } catch {
      throw new Error(`Failed to parse script JSON: ${(err as Error).message}. Repaired raw string was: ${jsonStr}`);
    }
  }
}

/**
 * Escapes literal newline characters within JSON double-quoted string values
 * so that standard JSON.parse doesn't throw on unescaped control characters.
 */
function escapeNewlinesInStrings(str: string): string {
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
      if (inString && char === '\n') {
        result += '\\n';
      } else if (inString && char === '\r') {
        result += '\\r';
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
