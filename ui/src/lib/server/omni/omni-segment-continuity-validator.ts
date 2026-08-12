import { JsonOutputParseError, parseAndRepairJson } from "./script-json-repair";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "minimax/minimax-m3";
const MIN_CONFIDENCE = 0.65;
const MAX_JSON_REPAIR_ATTEMPTS = 2;

export type SegmentContinuityValidation = {
  schemaVersion: "segment_continuity_v1";
  status: "pass" | "repair" | "block";
  confidence: number;
  violations: readonly { code: string; severity: "error" | "warning"; evidence: string }[];
  repairInstructions: readonly string[];
  model?: string;
};

export class SegmentContinuityValidationError extends Error {
  readonly validation: SegmentContinuityValidation;

  constructor(validation: SegmentContinuityValidation) {
    super(`Generated segment failed continuity QA: ${validation.violations.map((item) => `${item.code}: ${item.evidence}`).join("; ") || "no actionable evidence"}`);
    this.name = "SegmentContinuityValidationError";
    this.validation = validation;
  }
}

export function isSegmentContinuityValidationError(error: unknown): error is SegmentContinuityValidationError {
  return error instanceof SegmentContinuityValidationError;
}

export async function validateSegmentContinuityFrame(input: {
  segmentIndex: number;
  frameUrl: string;
  storyboardUrl: string;
  canonicalStoryboardUrl?: string | null;
  model?: string | null;
}) {
  const apiKey = process.env.OPENROUTER_API_KEY || "";
  if (!apiKey.trim()) throw new Error("OPENROUTER_API_KEY is not configured for segment continuity QA");
  const model = input.model || process.env.OMNI_STORYBOARD_VISION_MODEL || process.env.OMNI_DIRECTOR_ANALYSIS_MODEL || DEFAULT_MODEL;
  const response = await requestJson({
    apiKey,
    model,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: buildPrompt(input.segmentIndex, Boolean(input.canonicalStoryboardUrl)) },
        { type: "image_url", image_url: { url: input.frameUrl } },
        { type: "image_url", image_url: { url: input.storyboardUrl } },
        ...(input.canonicalStoryboardUrl ? [{ type: "image_url" as const, image_url: { url: input.canonicalStoryboardUrl } }] : []),
      ],
    }],
  });
  return parseValidation({ apiKey, model: String(response.model || model), content: getContent(response) });
}

export function getSegmentContinuityRepairInstructions(validation: SegmentContinuityValidation) {
  return [...new Set([
    ...validation.repairInstructions,
    ...validation.violations
      .filter((violation) => violation.severity === "error")
      .map((violation) => `${violation.code}: ${violation.evidence}`),
  ])];
}

async function parseValidation(input: { apiKey: string; model: string; content: string }) {
  let candidate = input.content;
  let lastError: JsonOutputParseError | null = null;
  for (let attempt = 0; attempt <= MAX_JSON_REPAIR_ATTEMPTS; attempt += 1) {
    try {
      return normalizeValidation(parseAndRepairJson(candidate), input.model);
    } catch (error) {
      if (!(error instanceof JsonOutputParseError)) throw error;
      lastError = error;
      if (attempt === MAX_JSON_REPAIR_ATTEMPTS) break;
      const repaired = await requestJson({
        apiKey: input.apiKey,
        model: input.model,
        messages: [
          { role: "system", content: "You repair malformed JSON. Return only one valid JSON object. Preserve the QA result exactly." },
          { role: "user", content: `Convert this malformed segment continuity QA response into JSON. Required shape: { status: pass|repair|block, confidence: number, violations: [{ code: string, severity: error|warning, evidence: string }], repair_instructions: string[] }.\nMalformed response:\n${error.rawJson.slice(0, 12_000)}` },
        ],
      });
      candidate = getContent(repaired);
    }
  }
  throw new Error(`Segment continuity QA returned invalid JSON after automatic repair: ${lastError?.message || "unknown JSON error"}`);
}

function normalizeValidation(value: unknown, model?: string): SegmentContinuityValidation {
  const source = isRecord(value) ? value : {};
  const violations = Array.isArray(source.violations)
    ? source.violations.map(normalizeViolation).filter(Boolean) as SegmentContinuityValidation["violations"]
    : [];
  const repairInstructions = normalizeStrings(source.repair_instructions);
  const confidence = clampConfidence(source.confidence);
  const hasError = violations.some((violation) => violation.severity === "error");
  const requestedStatus = source.status;
  const status = requestedStatus === "block" || confidence < MIN_CONFIDENCE
    ? "block"
    : requestedStatus === "repair" || hasError || repairInstructions.length
      ? "repair"
      : requestedStatus === "pass" ? "pass" : "block";
  return { schemaVersion: "segment_continuity_v1", status, confidence, violations, repairInstructions, model };
}

async function requestJson(input: { apiKey: string; model: string; messages: unknown[] }) {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey.trim()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://n8n-omnireels.ap2dy7.easypanel.host",
      "X-Title": "Omni Reels Segment Continuity QA",
    },
    body: JSON.stringify({ model: input.model, temperature: 0, response_format: { type: "json_object" }, messages: input.messages }),
  });
  if (!response.ok) throw new Error(`Segment continuity QA failed: ${response.status} ${(await response.text()).slice(0, 240)}`);
  return await response.json() as Record<string, unknown>;
}

function buildPrompt(segmentIndex: number, hasCanonicalStoryboard: boolean) {
  return [
    `You are a strict final-frame continuity QA for generated segment ${segmentIndex} of one vertical video.`,
    "Image 1 is the final frame of the generated video. Image 2 is the approved storyboard contact sheet for this segment.",
    hasCanonicalStoryboard ? "Image 3 is segment 1, the canonical outfit reference." : "Image 2 is also the canonical outfit reference.",
    "Reject if the generated final frame changes the presenter's face identity, garment type, sleeves, neckline, fabric, color, fit, accessories, hairstyle, room, lighting, camera framing, or product state compared with the approved storyboard. Normal speech gestures and minor mouth movement are allowed.",
    "Return only JSON: { status: pass|repair|block, confidence: number, violations: [{ code: string, severity: error|warning, evidence: string }], repair_instructions: string[] }.",
  ].join("\n");
}

function normalizeViolation(value: unknown) {
  if (!isRecord(value)) return null;
  return {
    code: typeof value.code === "string" && value.code.trim() ? value.code.trim() : "UNKNOWN_CONTINUITY_VIOLATION",
    severity: value.severity === "warning" ? "warning" : "error" as const,
    evidence: typeof value.evidence === "string" && value.evidence.trim() ? value.evidence.trim() : "No evidence provided",
  };
}

function normalizeStrings(value: unknown) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return values.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
}

function clampConfidence(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

function getContent(data: Record<string, unknown>) {
  const choice = Array.isArray(data.choices) ? data.choices[0] : null;
  const message = isRecord(choice) && isRecord(choice.message) ? choice.message : null;
  if (typeof message?.content === "string" && message.content.trim()) return message.content;
  throw new Error("Segment continuity QA model returned empty content");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
