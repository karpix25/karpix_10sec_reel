export type OmniSegmentOutputIssue = {
  code: string;
  severity: "critical" | "warning";
  message: string;
  evidence: string;
};

export type OmniSegmentVisualValidation = {
  status: "pass" | "block";
  score: number;
  confidence: number;
  issues: OmniSegmentOutputIssue[];
  model: string;
};

export type OmniSegmentTranscriptValidation = {
  status: "pass" | "block";
  expectedText: string;
  actualText: string;
  expectedWordCount: number;
  actualWordCount: number;
  unexpectedWordCount: number;
  missingWordCount: number;
  mismatchRatio: number;
};

export type OmniSegmentOutputValidation = {
  schemaVersion: "omni_segment_output_v1";
  status: "pass" | "block";
  score: number;
  visual: OmniSegmentVisualValidation;
  transcript: OmniSegmentTranscriptValidation;
  issues: OmniSegmentOutputIssue[];
};

const TOKEN_ALIASES: Record<string, string> = {
  "1": "один",
  "2": "два",
  "3": "три",
  "4": "четыре",
  "5": "пять",
  "6": "шесть",
  "7": "семь",
  "8": "восемь",
  "9": "девять",
  "10": "десять",
  одним: "один",
  одного: "один",
  одной: "один",
  семи: "семь",
  восьми: "восемь",
};

export function normalizeOmniSegmentVisualValidation(
  value: unknown,
  model: string
): OmniSegmentVisualValidation {
  const source = isRecord(value) ? value : {};
  const issues = Array.isArray(source.issues)
    ? source.issues.map(normalizeIssue).filter((issue): issue is OmniSegmentOutputIssue => Boolean(issue))
    : [];
  const confidence = clamp(Number(source.confidence), 0, 1, 0);
  const score = Math.round(clamp(Number(source.score), 0, 100, 0));
  const blocked = source.status !== "pass" || confidence < 0.75 || issues.some((issue) => issue.severity === "critical");
  return { status: blocked ? "block" : "pass", score, confidence, issues, model };
}

export function compareOmniSegmentTranscript(
  expectedText: string,
  actualText: string
): OmniSegmentTranscriptValidation {
  const expected = speechTokens(expectedText);
  const actual = speechTokens(actualText);
  const shared = longestCommonSubsequenceLength(expected, actual);
  const unexpectedWordCount = actual.length - shared;
  const missingWordCount = expected.length - shared;
  const mismatchRatio = Number(((unexpectedWordCount + missingWordCount) / Math.max(expected.length, 1)).toFixed(3));
  const blocked = expected.length
    ? !actual.length || unexpectedWordCount > 1 || missingWordCount > 1 || mismatchRatio > 0.12
    : actual.length > 0;
  return {
    status: blocked ? "block" : "pass",
    expectedText: expectedText.trim(),
    actualText: actualText.trim(),
    expectedWordCount: expected.length,
    actualWordCount: actual.length,
    unexpectedWordCount,
    missingWordCount,
    mismatchRatio,
  };
}

export function combineOmniSegmentOutputValidation(input: {
  visual: OmniSegmentVisualValidation;
  transcript: OmniSegmentTranscriptValidation;
}): OmniSegmentOutputValidation {
  const issues = [...input.visual.issues];
  if (input.transcript.status === "block") {
    issues.push({
      code: "SPEECH_SCRIPT_MISMATCH",
      severity: "critical",
      message: "Generated speech does not match the approved segment script.",
      evidence: `unexpected=${input.transcript.unexpectedWordCount}; missing=${input.transcript.missingWordCount}`,
    });
  }
  const transcriptScore = Math.max(0, Math.round(100 * (1 - input.transcript.mismatchRatio)));
  const blocked = input.visual.status === "block" || input.transcript.status === "block";
  return {
    schemaVersion: "omni_segment_output_v1",
    status: blocked ? "block" : "pass",
    score: Math.min(input.visual.score, transcriptScore),
    visual: input.visual,
    transcript: input.transcript,
    issues,
  };
}

function normalizeIssue(value: unknown): OmniSegmentOutputIssue | null {
  if (!isRecord(value)) return null;
  const message = cleanText(value.message);
  const code = cleanText(value.code).toUpperCase().replace(/[^A-Z0-9_]+/g, "_");
  if (!message || !code) return null;
  return {
    code,
    severity: value.severity === "critical" ? "critical" : "warning",
    message,
    evidence: cleanText(value.evidence),
  };
}

function speechTokens(text: string) {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .match(/[a-zа-я0-9]+/giu)
    ?.map((token) => TOKEN_ALIASES[token] || token) || [];
}

function longestCommonSubsequenceLength(left: string[], right: string[]) {
  // ponytail: segment scripts are short; replace with a linear diff only if segment limits grow materially.
  const row = new Array(right.length + 1).fill(0);
  for (const leftToken of left) {
    let diagonal = 0;
    for (let index = 1; index <= right.length; index += 1) {
      const previous = row[index];
      row[index] = leftToken === right[index - 1]
        ? diagonal + 1
        : Math.max(row[index], row[index - 1]);
      diagonal = previous;
    }
  }
  return row[right.length];
}

function clamp(value: number, min: number, max: number, fallback: number) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
