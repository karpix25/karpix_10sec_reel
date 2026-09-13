import type { OmniStoryboardSegment } from "../../omni/storyboard/omni-storyboard-types";
import type {
  StoryboardVisionValidation,
} from "../../omni/storyboard/omni-storyboard-vision-types";
import { JsonOutputParseError, parseAndRepairJson } from "./script-json-repair";
import { normalizeStoryboardVisionValidation } from "./storyboard-vision-contract";
import { STORYBOARD_STATIC_PHYSICS_QA_PROMPT } from "./storyboard-qa-contract";
import { isAvatarFreeReferenceScene, isFacelessReferenceScene, isObjectOnlyReferenceScene, resolveReferenceSceneMode, type ReferenceSceneMode } from "./omni-reference-scene-mode";
import type { ReferenceFormatMode } from "./omni-reference-format-mode";
import type { DirectorWardrobeContinuity } from "./director-wardrobe";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "minimax/minimax-m3";
const MAX_JSON_FORMAT_REPAIR_ATTEMPTS = 2;
const MAX_JSON_FORMAT_REPAIR_SOURCE_CHARS = 12_000;

export class StoryboardVisionJsonFormatError extends Error {
  readonly rawResponse: string;
  retryWithoutJobAttempt = false;

  constructor(rawResponse: string, cause: JsonOutputParseError) {
    super(`Storyboard vision validator returned invalid JSON after automatic repair: ${cause.message}`);
    this.name = "StoryboardVisionJsonFormatError";
    this.rawResponse = rawResponse;
  }
}

export function isStoryboardVisionJsonFormatError(error: unknown): error is StoryboardVisionJsonFormatError {
  return error instanceof StoryboardVisionJsonFormatError;
}

export async function validateStoryboardImage(input: {
  imageUrl: string;
  avatarReferenceUrl?: string | null;
  storyboard: OmniStoryboardSegment;
  productName: string;
  canonicalStoryboardReferenceUrl?: string | null;
  directorReferenceImageUrls?: readonly string[];
  referenceSceneMode?: ReferenceSceneMode;
  referenceFormatMode?: ReferenceFormatMode;
  wardrobeContinuity?: DirectorWardrobeContinuity;
  model?: string | null;
}): Promise<StoryboardVisionValidation> {
  const apiKey = process.env.OPENROUTER_API_KEY || "";
  if (!apiKey.trim()) throw new Error("OPENROUTER_API_KEY is not configured for storyboard vision validation");
  const model = input.model || process.env.OMNI_STORYBOARD_VISION_MODEL || process.env.OMNI_DIRECTOR_ANALYSIS_MODEL || DEFAULT_MODEL;
  const referenceSceneMode = input.referenceSceneMode || resolveReferenceSceneMode(null);
  const referenceFormatMode = input.referenceFormatMode || "continuous_story";
  const wardrobeContinuity = input.wardrobeContinuity || "unknown";
  const facelessReferenceScene = isFacelessReferenceScene(referenceSceneMode);
  const avatarFreeReferenceScene = isAvatarFreeReferenceScene(referenceSceneMode);
  const objectOnlyReferenceScene = isObjectOnlyReferenceScene(referenceSceneMode);
  if (!avatarFreeReferenceScene && !input.avatarReferenceUrl?.trim()) {
    throw new Error("Storyboard vision validation requires the avatar reference for presenter mode");
  }
  const data = await requestStoryboardVisionResponse({
    apiKey,
    model,
    messages: [
      { role: "system", content: `${objectOnlyReferenceScene
        ? STORYBOARD_VISION_OBJECT_ONLY_SYSTEM_PROMPT
        : facelessReferenceScene
        ? STORYBOARD_VISION_FACELESS_SYSTEM_PROMPT
        : referenceSceneMode === "voiceover_broll"
          ? STORYBOARD_VISION_BROLL_SYSTEM_PROMPT
        : referenceFormatMode === "voiceover_montage"
          ? STORYBOARD_VISION_MONTAGE_SYSTEM_PROMPT
          : STORYBOARD_VISION_SYSTEM_PROMPT} ${STORYBOARD_STATIC_PHYSICS_QA_PROMPT} ${renderWardrobeQaSystemInstruction(wardrobeContinuity)}` },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: buildStoryboardVisionPrompt({
              storyboard: input.storyboard,
              productName: input.productName,
              hasCanonicalStoryboardReference: Boolean(input.canonicalStoryboardReferenceUrl?.trim()),
              hasDirectorReference: Boolean(input.directorReferenceImageUrls?.length),
              referenceSceneMode,
              referenceFormatMode,
              wardrobeContinuity,
            }),
          },
          { type: "image_url", image_url: { url: input.imageUrl } },
          ...(avatarFreeReferenceScene || !input.avatarReferenceUrl?.trim()
            ? []
            : [{ type: "image_url" as const, image_url: { url: input.avatarReferenceUrl.trim() } }]),
          ...(input.canonicalStoryboardReferenceUrl?.trim()
            ? [{ type: "image_url" as const, image_url: { url: input.canonicalStoryboardReferenceUrl.trim() } }]
            : []),
          ...(input.directorReferenceImageUrls || []).slice(0, 1).map((url) => ({
            type: "image_url" as const,
            image_url: { url },
          })),
        ],
      },
    ],
  });
  const responseModel = String(data.model || model);
  const content = readAssistantContent(data);
  return parseStoryboardVisionValidation({ apiKey, model: responseModel, content });
}

async function requestStoryboardVisionResponse(input: {
  apiKey: string;
  model: string;
  messages: unknown[];
}) {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey.trim()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://n8n-omnireels.ap2dy7.easypanel.host",
      "X-Title": "Omni Reels Storyboard Physical Validation",
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: input.messages,
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Storyboard vision validation failed: ${response.status} ${text.slice(0, 240)}`);
  }
  return (await response.json()) as Record<string, unknown>;
}

async function parseStoryboardVisionValidation(input: {
  apiKey: string;
  model: string;
  content: string;
}) {
  let candidate = input.content;
  let lastError: JsonOutputParseError | null = null;

  for (let attempt = 0; attempt <= MAX_JSON_FORMAT_REPAIR_ATTEMPTS; attempt += 1) {
    try {
      return normalizeStoryboardVisionValidation(parseAndRepairJson(candidate), input.model);
    } catch (error) {
      if (!(error instanceof JsonOutputParseError)) throw error;
      lastError = error;
      if (attempt === MAX_JSON_FORMAT_REPAIR_ATTEMPTS) break;
      const repaired = await requestStoryboardVisionResponse({
        apiKey: input.apiKey,
        model: input.model,
        messages: [
          {
            role: "system",
            content: "You repair malformed JSON. Return only one valid JSON object. Preserve the original storyboard evaluation exactly. Do not add commentary.",
          },
          {
            role: "user",
            content: [
              "Convert this malformed storyboard evaluation into valid JSON.",
              "Required shape: { status: pass|repair|block, confidence: number, panels: [{ panel_index: integer, status: pass|repair|block, violations: [{ code: string, severity: error|warning, evidence: string }] }], repair_instructions: string[] }.",
              "Malformed response:",
              truncateJsonRepairSource(error.rawJson),
            ].join("\n"),
          },
        ],
      });
      candidate = readAssistantContent(repaired);
    }
  }

  throw new StoryboardVisionJsonFormatError(input.content, lastError || new JsonOutputParseError("Unknown JSON error", input.content));
}

const STORYBOARD_VISION_SYSTEM_PROMPT = [
  "You are a strict static visual QA auditor for storyboard contact sheets.",
  "Inspect only facts that are positively visible. Identity and form error codes are FEATURED_IDENTITY_MISMATCH, PRODUCT_MISSING, PRODUCT_FORM_MISMATCH, FOREIGN_PRODUCT, and GROSS_VISUAL_CORRUPTION. Use them only when the featured/main person is clearly not the supplied avatar, a planned client product is absent, the client product has the wrong physical form or is visibly replaced by a foreign advertised product, or the image has gross corruption such as a melted face, extra limb, or impossible phone.",
  "In non-product panels, background people are allowed. Clothing, camera, location, gesture, mouth state, timing, and reference similarity are creative choices and never errors.",
  "Return only valid JSON with exactly this shape: { status: pass|repair|block, confidence: number, panels: [{ panel_index: integer, status: pass|repair|block, violations: [{ code: string, severity: error|warning, evidence: string }] }], repair_instructions: string[] }. Include every expected panel.",
  "If a detail is ambiguous, outside the crop, or cannot be verified, omit it or return a warning. Do not block on uncertainty.",
].join(" ");

const STORYBOARD_VISION_FACELESS_SYSTEM_PROMPT = [
  "You are a strict static visual QA auditor for faceless storyboard contact sheets.",
  "Inspect only facts that are positively visible in the candidate panels.",
  "The approved format is hands-only, body-crop, or object-only with off-camera narration.",
  "Use severity error when a face, head, eyes, lips, portrait, or talking-head framing is visibly introduced. Do not require avatar identity, face, hair, or wardrobe continuity.",
  "Hands, arms, and an approved body crop are allowed only in non-product panels when required by the storyboard plan. Product panels follow the object-only physical contract.",
  "Return only valid JSON with exactly this shape: { status: pass|repair|block, confidence: number, panels: [{ panel_index: integer, status: pass|repair|block, violations: [{ code: string, severity: error|warning, evidence: string }] }], repair_instructions: string[] }. Include every expected panel.",
  "If a detail is ambiguous or cannot be verified, omit it or return a warning. Do not block on uncertainty.",
].join(" ");

const STORYBOARD_VISION_OBJECT_ONLY_SYSTEM_PROMPT = [
  "You are a strict static visual QA auditor for object-only storyboard contact sheets.",
  "Inspect only facts that are positively visible in the candidate panels.",
  "The approved format is object-only with off-camera narration.",
  "Use severity error when a person, hand, face, head, eyes, lips, portrait, or talking-head framing is visibly introduced. Do not require avatar identity, face, hair, or wardrobe continuity.",
  "Only the approved surface, product, and conceptual props are allowed when required by the storyboard plan.",
  "Return only valid JSON with exactly this shape: { status: pass|repair|block, confidence: number, panels: [{ panel_index: integer, status: pass|repair|block, violations: [{ code: string, severity: error|warning, evidence: string }] }], repair_instructions: string[] }. Include every expected panel.",
  "If a detail is ambiguous or cannot be verified, omit it or return a warning. Do not block on uncertainty.",
].join(" ");

const STORYBOARD_VISION_MONTAGE_SYSTEM_PROMPT = [
  "You are a strict static visual QA auditor for storyboard contact sheets in a voiceover montage.",
  "Inspect only facts that are positively visible. Identity and form error codes are FEATURED_IDENTITY_MISMATCH, PRODUCT_MISSING, PRODUCT_FORM_MISMATCH, FOREIGN_PRODUCT, and GROSS_VISUAL_CORRUPTION. Use them only when the featured/main person is clearly not the supplied avatar, a planned client product is absent, the client product has the wrong physical form or is visibly replaced by a foreign advertised product, or the image has gross visual corruption.",
  "Independent scenes and background people in non-product panels are allowed. Clothing, camera, location, gesture, mouth state, timing, and source-reference similarity are creative choices and never errors.",
  "Return only valid JSON with exactly this shape: { status: pass|repair|block, confidence: number, panels: [{ panel_index: integer, status: pass|repair|block, violations: [{ code: string, severity: error|warning, evidence: string }] }], repair_instructions: string[] }. Include every expected panel.",
  "If a detail is ambiguous, outside the crop, or cannot be verified, omit it or return a warning. Do not block on uncertainty.",
].join(" ");

const STORYBOARD_VISION_BROLL_SYSTEM_PROMPT = [
  "You are a strict static visual QA auditor for storyboard contact sheets in voiceover B-roll.",
  "Inspect only facts that are positively visible. Identity and form error codes are FEATURED_IDENTITY_MISMATCH, PRODUCT_MISSING, PRODUCT_FORM_MISMATCH, FOREIGN_PRODUCT, and GROSS_VISUAL_CORRUPTION. Use them only when the featured/main person is clearly not the supplied avatar, a planned client product is absent, the client product has the wrong physical form or is visibly replaced by a foreign advertised product, or the image has gross visual corruption.",
  "Background people in non-product panels, visible speaking, lip movement, clothing, camera, location, gesture, timing, and source-reference similarity are creative choices and never errors.",
  "Return only valid JSON with exactly this shape: { status: pass|repair|block, confidence: number, panels: [{ panel_index: integer, status: pass|repair|block, violations: [{ code: string, severity: error|warning, evidence: string }] }], repair_instructions: string[] }. Include every expected panel.",
  "If a detail is ambiguous or cannot be verified, omit it or return a warning. Do not block on uncertainty.",
].join(" ");

function buildStoryboardVisionPrompt(input: {
  storyboard: OmniStoryboardSegment;
  productName: string;
  hasCanonicalStoryboardReference: boolean;
  hasDirectorReference: boolean;
  referenceSceneMode: ReferenceSceneMode;
  referenceFormatMode: ReferenceFormatMode;
  wardrobeContinuity: DirectorWardrobeContinuity;
}) {
  if (isFacelessReferenceScene(input.referenceSceneMode)) {
    const objectOnlyReferenceScene = isObjectOnlyReferenceScene(input.referenceSceneMode);
    return [
      "The first image is the candidate storyboard. No avatar identity reference is supplied because this is a faceless reference format.",
      input.hasCanonicalStoryboardReference
        ? "The next image is the canonical storyboard for scene and prop continuity only; it is not an identity reference."
        : "",
      input.hasDirectorReference
        ? "The final supplied image is a source-reference frame for camera, light, props, and action only."
        : "",
      objectOnlyReferenceScene
        ? "For every panel, verify that no person, hand, face, head, eyes, lips, portrait, or talking-head framing is visible. Only the approved surface, product, and conceptual props are allowed."
        : "For every panel, verify that no face, head, eyes, lips, portrait, or talking-head framing is visible. Hands, arms, and body crops are allowed only in non-product panels when present in the storyboard plan. Product panels follow the object-only physical contract.",
      "Expected storyboard plan:",
      JSON.stringify({
        product: input.productName,
        panels: input.storyboard.frames.map((frame, index) => ({
          panel_index: index + 1,
          product_placement: frame.productPlacement,
          physical_plan: frame.physicalPlan || null,
          reference_transfer: frame.referenceTransfer || null,
          visual_action: frame.visualAction,
        })),
      }),
    ].join("\n");
  }
  if (input.referenceSceneMode === "voiceover_broll") {
    return [
      "The first image is the candidate storyboard. The supplied avatar image is the identity reference for any featured/main human.",
      input.hasCanonicalStoryboardReference ? "The next image is a visual-mechanics reference only; the avatar image remains the identity authority." : "",
      input.hasDirectorReference ? "The final supplied image is a source-reference frame for B-roll location, light, camera, and action only." : "",
      "Verify that a featured/main human is the supplied avatar and inspect the static product defects defined in the system instructions. Natural background people and visible speaking are allowed in non-product panels.",
      "Expected storyboard plan:",
      JSON.stringify({
        product: input.productName,
        panels: input.storyboard.frames.map((frame, index) => ({
          panel_index: index + 1,
          product_placement: frame.productPlacement,
          physical_plan: frame.physicalPlan || null,
          visual_action: frame.visualAction,
        })),
      }),
    ].join("\n");
  }
  return [
    "The first image is the candidate storyboard. The second image is the approved avatar identity reference for any featured/main human.",
    input.hasCanonicalStoryboardReference ? "The next image is previous approved visual context only, not a wardrobe, camera, or scene lock." : "",
    input.hasDirectorReference
      ? "The final supplied image is a source-reference frame. It is a creative source only: never use it to reject camera, gesture, action timing, face identity, clothing, source brand, text, or logos in the candidate."
      : "",
    "Expected storyboard plan:",
    JSON.stringify({
      product: input.productName,
      panels: input.storyboard.frames.map((frame, index) => ({
        panel_index: index + 1,
        product_placement: frame.productPlacement,
        physical_plan: frame.physicalPlan || null,
        visual_action: frame.visualAction,
        reference_transfer: frame.referenceTransfer || null,
        wardrobe: frame.wardrobe,
      })),
    }),
    "Inspect the identity, product form, and static physical defects defined in the system instructions. Background people in non-product panels, wardrobe, camera, location, gestures, mouth state, timing, and similarity to the reference are not blockers.",
  ].join("\n");
}

function renderWardrobeQaSystemInstruction(continuity: DirectorWardrobeContinuity) {
  void continuity;
  return "Wardrobe is creative guidance only. Never emit a wardrobe error or request regeneration for clothing.";
}

function readAssistantContent(data: Record<string, unknown>) {
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const firstChoice = choices[0];
  const message = firstChoice && typeof firstChoice === "object" && !Array.isArray(firstChoice)
    ? (firstChoice as Record<string, unknown>).message
    : null;
  const content = message && typeof message === "object" && !Array.isArray(message)
    ? (message as Record<string, unknown>).content
    : null;
  if (typeof content === "string" && content.trim()) return content;
  throw new Error("Storyboard vision model returned empty content");
}

function truncateJsonRepairSource(value: string) {
  return value.length <= MAX_JSON_FORMAT_REPAIR_SOURCE_CHARS
    ? value
    : `${value.slice(0, MAX_JSON_FORMAT_REPAIR_SOURCE_CHARS)}\n[truncated]`;
}
