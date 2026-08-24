import type { OmniStoryboardSegment } from "@/lib/omni/storyboard/omni-storyboard-types";
import type {
  StoryboardSetQualityRecord,
  StoryboardSetVisionValidation,
  StoryboardSetVisionViolation,
} from "@/lib/omni/storyboard/omni-storyboard-set-vision-types";
import { JsonOutputParseError, parseAndRepairJson } from "./script-json-repair";
import {
  isBlockingStoryboardQaViolation,
  isStoryboardQaMetadataOnly,
  normalizeStoryboardQaViolation,
} from "./storyboard-qa-contract";
import type { DirectorWardrobeContinuity } from "./director-wardrobe";
import type { ReferenceFormatMode } from "./omni-reference-format-mode";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "minimax/minimax-m3";
const MIN_CONFIDENCE = 0.65;
const MAX_JSON_REPAIR_ATTEMPTS = 2;
const MAX_JSON_REPAIR_SOURCE_CHARS = 12_000;
export const STORYBOARD_SET_QA_POLICY_VERSION = "storyboard-set-qa-v8";

export class StoryboardSetVisionJsonFormatError extends Error {
  readonly rawResponse: string;
  retryWithoutJobAttempt = false;

  constructor(rawResponse: string, cause: JsonOutputParseError) {
    super(`Storyboard set QA returned invalid JSON after automatic repair: ${cause.message}`);
    this.name = "StoryboardSetVisionJsonFormatError";
    this.rawResponse = rawResponse;
  }
}

export function isStoryboardSetVisionJsonFormatError(error: unknown): error is StoryboardSetVisionJsonFormatError {
  return error instanceof StoryboardSetVisionJsonFormatError;
}

export async function validateStoryboardSet(input: {
  storyboards: readonly { segmentIndex: number; imageUrl: string; storyboard: OmniStoryboardSegment }[];
  productName?: string;
  productReferenceUrls?: readonly string[];
  model?: string | null;
  referenceFormatMode?: ReferenceFormatMode;
  wardrobeContinuity?: DirectorWardrobeContinuity;
}) {
  if (input.storyboards.length < 2) return buildSingleSegmentPass(input.storyboards[0]?.segmentIndex || 1);
  const apiKey = process.env.OPENROUTER_API_KEY || "";
  if (!apiKey.trim()) throw new Error("OPENROUTER_API_KEY is not configured for storyboard set QA");

  const model = input.model || process.env.OMNI_STORYBOARD_VISION_MODEL || process.env.OMNI_DIRECTOR_ANALYSIS_MODEL || DEFAULT_MODEL;
  const productReferenceUrls = uniqueUrls(input.productReferenceUrls || []).slice(0, 3);
  const response = await requestVisionJson({
    apiKey,
    model,
    messages: [{
      role: "user",
      content: [
        {
          type: "text",
          text: buildStoryboardSetVisionPrompt({
            storyboards: input.storyboards,
            productName: input.productName,
            productReferenceCount: productReferenceUrls.length,
            referenceFormatMode: input.referenceFormatMode || "continuous_story",
            wardrobeContinuity: input.wardrobeContinuity || "unknown",
          }),
        },
        ...input.storyboards.map((storyboard) => ({ type: "image_url" as const, image_url: { url: storyboard.imageUrl } })),
        ...productReferenceUrls.map((url) => ({ type: "image_url" as const, image_url: { url } })),
      ],
    }],
  });
  const responseModel = String(response.model || model);
  return parseStoryboardSetVisionValidation({ apiKey, model: responseModel, content: readAssistantContent(response) });
}

export function normalizeStoryboardSetVisionValidation(value: unknown, model?: string): StoryboardSetVisionValidation {
  const source = isRecord(value) ? value : {};
  const violations = (Array.isArray(source.violations)
    ? source.violations.map(normalizeViolation).filter(Boolean) as StoryboardSetVisionViolation[]
    : [])
    .filter((violation) => !isStoryboardQaMetadataOnly(violation))
    .map(normalizeStoryboardQaViolation)
    .map(downgradeAvatarWardrobeEvidence);
  const hasError = violations.some(isBlockingStoryboardQaViolation);
  const repairInstructions = hasError ? normalizeStrings(source.repair_instructions) : [];
  const confidence = clampConfidence(source.confidence);
  const requestedStatus = source.status;
  const status = confidence < MIN_CONFIDENCE
    ? hasError ? "block" : "pass"
    : hasError
      ? requestedStatus === "block" ? "block" : "repair"
      : "pass";

  return {
    schemaVersion: "storyboard_set_vision_v1",
    status,
    confidence,
    canonicalIdentity: typeof source.canonical_identity === "string" ? source.canonical_identity.trim() : "",
    violations,
    repairInstructions,
    model,
  };
}

export function getStoryboardSetRepairSegments(validation: StoryboardSetVisionValidation) {
  return [...new Set(
    validation.violations
      .filter(isBlockingStoryboardQaViolation)
      .map((violation) => violation.segmentIndex)
  )].sort((left, right) => left - right);
}

export function buildStoryboardSetQualityRecord(input: {
  validation: StoryboardSetVisionValidation;
  storyboards: readonly { segmentIndex: number; imageUrl: string }[];
  attemptCount: number;
}): StoryboardSetQualityRecord {
  return {
    policyVersion: STORYBOARD_SET_QA_POLICY_VERSION,
    validation: input.validation,
    storyboardUrls: input.storyboards.map((storyboard) => ({
      segmentIndex: storyboard.segmentIndex,
      url: storyboard.imageUrl,
    })),
    attemptCount: input.attemptCount,
    checkedAt: new Date().toISOString(),
  };
}

async function parseStoryboardSetVisionValidation(input: { apiKey: string; model: string; content: string }) {
  let candidate = input.content;
  let lastError: JsonOutputParseError | null = null;
  for (let attempt = 0; attempt <= MAX_JSON_REPAIR_ATTEMPTS; attempt += 1) {
    try {
      return normalizeStoryboardSetVisionValidation(parseAndRepairJson(candidate), input.model);
    } catch (error) {
      if (!(error instanceof JsonOutputParseError)) throw error;
      lastError = error;
      if (attempt === MAX_JSON_REPAIR_ATTEMPTS) break;
      const repaired = await requestVisionJson({
        apiKey: input.apiKey,
        model: input.model,
        messages: [
          { role: "system", content: "You repair malformed JSON. Return only one valid JSON object. Preserve the QA result exactly." },
          { role: "user", content: [
            "Convert this malformed storyboard set QA response into valid JSON.",
            "Required shape: { status: pass|repair|block, confidence: number, canonical_identity: string, violations: [{ segment_index: integer, panels: integer[], code: string, severity: error|warning, evidence: string }], repair_instructions: string[] }.",
            "Malformed response:",
            truncateJsonRepairSource(error.rawJson),
          ].join("\n") },
        ],
      });
      candidate = readAssistantContent(repaired);
    }
  }
  throw new StoryboardSetVisionJsonFormatError(input.content, lastError || new JsonOutputParseError("Unknown JSON error", input.content));
}

async function requestVisionJson(input: { apiKey: string; model: string; messages: unknown[] }) {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey.trim()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://n8n-omnireels.ap2dy7.easypanel.host",
      "X-Title": "Omni Reels Cross-Storyboard QA",
    },
    body: JSON.stringify({ model: input.model, temperature: 0, response_format: { type: "json_object" }, messages: input.messages }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Storyboard set QA failed: ${response.status} ${text.slice(0, 240)}`);
  }
  return await response.json() as Record<string, unknown>;
}

function buildStoryboardSetVisionPrompt(input: {
  storyboards: readonly { segmentIndex: number; storyboard: OmniStoryboardSegment }[];
  productName?: string;
  productReferenceCount: number;
  referenceFormatMode: ReferenceFormatMode;
  wardrobeContinuity: DirectorWardrobeContinuity;
}) {
  const canonical = input.storyboards[0];
  const wardrobe = canonical?.storyboard.frames[0]?.wardrobe || "the complete visible outfit in segment 1";
  const montageReference = input.referenceFormatMode === "voiceover_montage";
  const stableWardrobe = input.wardrobeContinuity === "stable";
  const wardrobeContract = input.wardrobeContinuity === "changes_between_cuts"
    ? "The analyzed wardrobe policy is changes_between_cuts: use each segment's own expected wardrobe; a visible outfit change between source intervals is valid."
    : input.wardrobeContinuity === "not_visible"
      ? "The analyzed wardrobe policy is not_visible: clothing is out of scope; do not require or block wardrobe details."
      : input.wardrobeContinuity === "unknown"
        ? "The analyzed wardrobe policy is unknown: do not infer continuity from the format and do not block uncertain wardrobe details."
        : "The analyzed wardrobe policy is stable: the first approved storyboard's visible core garment is canonical across the reel.";
  const visualContracts = input.storyboards.map((storyboard) => ({
    segment_index: storyboard.segmentIndex,
    panels: storyboard.storyboard.frames.map((frame, panelIndex) => ({
      panel_index: panelIndex + 1,
      expected_wardrobe: frame.wardrobe,
      required_support_props: frame.referenceTransfer?.requiredSupportProps || [],
      product_placement: frame.productPlacement,
      physical_plan: frame.physicalPlan || null,
    })),
  }));
  return [
    montageReference
      ? "You are a cross-segment identity and product QA for a voiceover montage. The video intentionally contains independent cutaways, not one continuous physical scene."
      : "You are a strict cross-segment continuity QA for one vertical video.",
    `The first ${input.storyboards.length} image(s) are contact sheets in order: ${input.storyboards.map((storyboard, index) => `contact sheet ${index + 1} is segment ${storyboard.segmentIndex}`).join("; ")}.`,
    input.productReferenceCount ? `The next ${input.productReferenceCount} image(s) are product references for ${input.productName || "the client product"}. When the storyboard plan shows the product, its visible package must match these references.` : "No product reference images were supplied.",
    wardrobeContract,
    stableWardrobe
      ? "Do not use an avatar reference in this QA pass. Segment 1 contact sheet is the visual authority for the presenter outfit and hairstyle. Compare later visible presenter panels against it; do not require offscreen accessories."
      : "Do not use an avatar reference in this QA pass. Compare each panel against its own storyboard plan and corresponding source interval; do not create a whole-reel wardrobe lock.",
    stableWardrobe
      ? "Block only a positively visible contradiction in face, hair, or the canonical core garment: garment type, sleeves, neckline, fabric, color, or fit. A detail wholly outside a panel is not a mismatch; do not block accessories."
      : input.wardrobeContinuity === "changes_between_cuts"
        ? "Block only a positively visible contradiction in face, hair, or that segment's own expected core garment. A wardrobe difference between segments is valid and must not be reported as wardrobe_mismatch."
        : "Do not block wardrobe differences or uncertain clothing details. Block only positively visible identity or product contradictions.",
    stableWardrobe ? `Canonical wardrobe contract: ${wardrobe}.` : "No whole-reel canonical wardrobe contract.",
    "Also check only these static product facts. When the plan shows the client product, its visible package must match the supplied product references. Block a visibly wrong client package or a visible foreign advertised product, brand, package, box, bottle, jar, stick, sachet, or logo. Neutral support props are allowed only when listed in required_support_props. Do not infer a copied product from ordinary food, a bag, a table, or another neutral object without positive branded-package evidence.",
    "A contact sheet is static. Expected action, hand approach, touch, pickup timing, product motion, face gestures, reference gestures, and camera composition are video-prompt metadata, never QA blockers. Do not emit an error for any of them. Do not block because a hand movement happens between panels, because a product is cropped, or because a detail cannot be verified. Only report an error when the contradictory visual fact is positively visible.",
    `Visual-mechanics contracts: ${JSON.stringify(visualContracts)}.`,
    "Return only JSON: { status: pass|repair|block, confidence: number, canonical_identity: string, violations: [{ segment_index: integer, panels: integer[], code: string, severity: error|warning, evidence: string }], repair_instructions: string[] }.",
    stableWardrobe
      ? "Use severity error only for a positively visible face, hair, canonical core-garment, client-package, or foreign-advertised-product contradiction."
      : input.wardrobeContinuity === "changes_between_cuts"
        ? "Use severity error only for a positively visible identity contradiction, a contradiction with that segment's own core-garment plan, a client-package mismatch, or a foreign-advertised-product contradiction. Never use wardrobe_mismatch for a valid outfit change between segments."
        : "Use severity error only for a positively visible identity, client-package, or foreign-advertised-product contradiction; wardrobe is not a blocker under the analyzed policy.",
    "All other observations are warnings or omitted. If every segment matches, return pass with an empty violations array.",
  ].join("\n");
}

function normalizeViolation(value: unknown): StoryboardSetVisionViolation | null {
  if (!isRecord(value)) return null;
  const segmentIndex = Number(value.segment_index ?? value.segmentIndex);
  if (!Number.isInteger(segmentIndex) || segmentIndex < 1) return null;
  const panels = Array.isArray(value.panels)
    ? value.panels.map(Number).filter((panel) => Number.isInteger(panel) && panel > 0)
    : [];
  return {
    segmentIndex,
    panels,
    code: typeof value.code === "string" && value.code.trim() ? value.code.trim() : "UNKNOWN_CROSS_SEGMENT_VIOLATION",
    severity: value.severity === "warning" ? "warning" : "error",
    evidence: typeof value.evidence === "string" && value.evidence.trim() ? value.evidence.trim() : "No evidence provided",
  };
}

function downgradeAvatarWardrobeEvidence(violation: StoryboardSetVisionViolation) {
  const isWardrobeViolation = /(?:wardrobe|outfit|garment|clothing|sleeve|neckline|fabric)/iu.test(violation.code);
  const referencesAvatar = /(?:avatar|character reference|identity reference|аватар|персонаж)/iu.test(violation.evidence);
  return isWardrobeViolation && referencesAvatar
    ? { ...violation, severity: "warning" as const }
    : violation;
}

function buildSingleSegmentPass(segmentIndex: number): StoryboardSetVisionValidation {
  return {
    schemaVersion: "storyboard_set_vision_v1",
    status: "pass",
    confidence: 1,
    canonicalIdentity: `segment ${segmentIndex} is the only storyboard`,
    violations: [],
    repairInstructions: [],
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

function readAssistantContent(data: Record<string, unknown>) {
  const choice = Array.isArray(data.choices) ? data.choices[0] : null;
  const message = isRecord(choice) && isRecord(choice.message) ? choice.message : null;
  const content = message?.content;
  if (typeof content === "string" && content.trim()) return content;
  throw new Error("Storyboard set QA model returned empty content");
}

function truncateJsonRepairSource(value: string) {
  return value.length <= MAX_JSON_REPAIR_SOURCE_CHARS ? value : `${value.slice(0, MAX_JSON_REPAIR_SOURCE_CHARS)}\n[truncated]`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function uniqueUrls(values: readonly string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
