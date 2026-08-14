import type { OmniStoryboardSegment } from "@/lib/omni/storyboard/omni-storyboard-types";
import type {
  StoryboardSetQualityRecord,
  StoryboardSetVisionValidation,
  StoryboardSetVisionViolation,
} from "@/lib/omni/storyboard/omni-storyboard-set-vision-types";
import { JsonOutputParseError, parseAndRepairJson } from "./script-json-repair";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "minimax/minimax-m3";
const MIN_CONFIDENCE = 0.65;
const MAX_JSON_REPAIR_ATTEMPTS = 2;
const MAX_JSON_REPAIR_SOURCE_CHARS = 12_000;
export const STORYBOARD_SET_QA_POLICY_VERSION = "storyboard-set-qa-v6";

const SOFT_REFERENCE_VIOLATION_CODES = /(?:^|_)(?:reference_action|reference_composition|camera_composition)(?:_|$)/iu;

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
  avatarReferenceUrl?: string | null;
  productName?: string;
  productReferenceUrls?: readonly string[];
  model?: string | null;
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
            hasAvatarReference: Boolean(input.avatarReferenceUrl?.trim()),
            productName: input.productName,
            productReferenceCount: productReferenceUrls.length,
          }),
        },
        ...input.storyboards.map((storyboard) => ({ type: "image_url" as const, image_url: { url: storyboard.imageUrl } })),
        ...productReferenceUrls.map((url) => ({ type: "image_url" as const, image_url: { url } })),
        ...(input.avatarReferenceUrl?.trim()
          ? [{ type: "image_url" as const, image_url: { url: input.avatarReferenceUrl.trim() } }]
          : []),
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
    : []).filter((violation) => !SOFT_REFERENCE_VIOLATION_CODES.test(violation.code));
  const repairInstructions = normalizeStrings(source.repair_instructions);
  const confidence = clampConfidence(source.confidence);
  const requestedStatus = source.status;
  const hasError = violations.some((violation) => violation.severity === "error");
  const status = confidence < MIN_CONFIDENCE
    ? "block"
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
      .filter((violation) => violation.severity === "error")
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
  hasAvatarReference: boolean;
  productName?: string;
  productReferenceCount: number;
}) {
  const canonical = input.storyboards[0];
  const wardrobe = canonical?.storyboard.frames[0]?.wardrobe || "the complete visible outfit in segment 1";
  const visualContracts = input.storyboards.map((storyboard) => ({
    segment_index: storyboard.segmentIndex,
    panels: storyboard.storyboard.frames.map((frame, panelIndex) => ({
      panel_index: panelIndex + 1,
      expected_wardrobe: frame.wardrobe,
      required_support_props: frame.referenceTransfer?.requiredSupportProps || [],
      expected_action: frame.visualAction,
      reference_action_hint: frame.referenceTransfer?.requiredReferenceAction || null,
      reference_camera_hint: frame.referenceTransfer?.cameraComposition || null,
      product_placement: frame.productPlacement,
      physical_plan: frame.physicalPlan || null,
    })),
  }));
  return [
    "You are a strict cross-segment continuity QA for one vertical video.",
    `The first ${input.storyboards.length} image(s) are contact sheets in order: ${input.storyboards.map((storyboard, index) => `contact sheet ${index + 1} is segment ${storyboard.segmentIndex}`).join("; ")}.`,
    input.productReferenceCount ? `The next ${input.productReferenceCount} image(s) are product references for ${input.productName || "the client product"}. When the storyboard plan shows the product, its visible package must match these references.` : "No product reference images were supplied.",
    input.hasAvatarReference ? "The final image is the avatar identity reference only. Every visible presenter must match it in gender, face, hair, and body type. Do not compare its clothing, accessories, room, lighting, or camera with the contact sheets." : "No avatar identity reference was supplied.",
    "Segment 1 becomes the canonical visual identity only when it matches its own expected wardrobe. Then compare every visible presenter panel in every later segment against it.",
    "The expected_wardrobe in the visual-mechanics contract is the complete outfit ground truth, not a requirement to show every detail in every crop. Use the segment 1 contact sheet, not the avatar reference, as the canonical source for wardrobe, accessories, room, lighting, and camera between segments. Reject a visible change from segment 1 in garment type, sleeves, neckline, fabric, color, fit, accessories, hairstyle, hair parting, face identity, body type, room, lighting, or camera setup. A detail wholly outside a panel is not a mismatch: do not fail a close crop because jeans, a watch, a ring, or earrings are offscreen. If that detail is visible, it must match exactly. Different hand gestures are allowed. A spoken subject change never permits an outfit change.",
    `Canonical wardrobe contract: ${wardrobe}.`,
    "Also check the visual-mechanics contracts below. Only items explicitly listed as required_support_props are neutral support props. The advertised product from the source, including its package, box, bottle, jar, stick, or sachet, is never a support prop: it must be replaced by the client product where planned or absent where the plan says product outside frame. The expected_action is the hard action contract for that exact panel: reject a different or missing planned action with frame_action_mismatch severity error. reference_action_hint and reference_camera_hint are soft direction only. They must never cause a violation or repair by themselves: a different literal hand pose, gesture timing, or crop is allowed when expected_action, product physics, and continuity are correct.",
    "Physical product continuity is mandatory. Read physical_plan.productState and product_placement before actionKind. In a visible product-demo segment, the client product must be visibly present in every panel. A first panel whose plan says surface and whose placement says it is already on a visible surface is a valid start, not a put_down and not product_teleportation. It may be picked up only through a visible hand movement, and must be visibly returned to that surface before the segment ends. Reject only a disappearance, appearance in a hand without a prior pickup, or another state change that conflicts with the plan. A face-touch gesture is valid only when that panel's spoken line is specifically about skin, face, or application; otherwise use face_gesture_without_spoken_reason with severity error.",
    `Visual-mechanics contracts: ${JSON.stringify(visualContracts)}.`,
    "Return only JSON: { status: pass|repair|block, confidence: number, canonical_identity: string, violations: [{ segment_index: integer, panels: integer[], code: string, severity: error|warning, evidence: string }], repair_instructions: string[] }.",
    "For any outfit or identity mismatch, use severity error and list every affected segment and panel. If every segment matches, return pass with an empty violations array.",
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
