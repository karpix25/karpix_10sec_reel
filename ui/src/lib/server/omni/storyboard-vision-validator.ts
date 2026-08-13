import type { OmniStoryboardSegment } from "../../omni/storyboard/omni-storyboard-types";
import type {
  StoryboardVisionValidation,
} from "../../omni/storyboard/omni-storyboard-vision-types";
import { JsonOutputParseError, parseAndRepairJson } from "./script-json-repair";
import { normalizeStoryboardVisionValidation } from "./storyboard-vision-contract";

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
  avatarReferenceUrl: string;
  storyboard: OmniStoryboardSegment;
  productName: string;
  canonicalStoryboardReferenceUrl?: string | null;
  directorReferenceImageUrls?: readonly string[];
  model?: string | null;
}): Promise<StoryboardVisionValidation> {
  const apiKey = process.env.OPENROUTER_API_KEY || "";
  if (!apiKey.trim()) throw new Error("OPENROUTER_API_KEY is not configured for storyboard vision validation");
  const model = input.model || process.env.OMNI_STORYBOARD_VISION_MODEL || process.env.OMNI_DIRECTOR_ANALYSIS_MODEL || DEFAULT_MODEL;
  const data = await requestStoryboardVisionResponse({
    apiKey,
    model,
    messages: [
      { role: "system", content: STORYBOARD_VISION_SYSTEM_PROMPT },
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
            }),
          },
          { type: "image_url", image_url: { url: input.imageUrl } },
          { type: "image_url", image_url: { url: input.avatarReferenceUrl } },
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
  "You are a strict physical continuity auditor for storyboard contact sheets.",
  "Inspect the generated contact sheet, panel by panel, and compare it with the expected storyboard plan.",
  "Compare the candidate contact sheet against the supplied avatar identity reference. When a canonical storyboard image is supplied, compare the candidate contact sheet against it for the hero outfit.",
  "Judge hard visual contracts too: product visibility, required neutral support props, required reference actions, composition, the one locked outfit, avatar identity, camera angle, lighting, environment, and whether the image action matches the spoken line.",
  "Return only valid JSON with exactly this shape: { status: pass|repair|block, confidence: number, panels: [{ panel_index: integer, status: pass|repair|block, violations: [{ code: string, severity: error|warning, evidence: string }] }], repair_instructions: string[] }. Include every expected panel.",
  "If the image is ambiguous or you cannot verify a physical constraint, return block with low confidence.",
].join(" ");

function buildStoryboardVisionPrompt(input: {
  storyboard: OmniStoryboardSegment;
  productName: string;
  hasCanonicalStoryboardReference: boolean;
  hasDirectorReference: boolean;
}) {
  return [
    input.hasCanonicalStoryboardReference
      ? "The first image is the candidate storyboard. The second image is the approved avatar identity reference. The third image is the approved canonical storyboard outfit reference. Every candidate panel must show the same person as the avatar: perceived gender, age range, face, hair, and body type. The candidate must also preserve every visible outfit detail from the canonical reference: garment type, sleeves, neckline, fabric, color, glasses, jewelry, and hair. Ignore a detail only when it is not visible in the candidate panel. Any identity or visible outfit mismatch requires repair."
      : "The first image is the candidate storyboard. The second image is the approved avatar identity reference. Every candidate panel must show the same person as the avatar: perceived gender, age range, face, hair, and body type. Any identity mismatch requires repair.",
    input.hasDirectorReference
      ? "The final supplied image is a source-reference frame. Use it only to verify camera geometry, scene mechanics, required neutral props, and physical actions. Never copy its face, source brand, text, or logos."
      : "",
    "Expected storyboard plan:",
    JSON.stringify({
      product: input.productName,
      panels: input.storyboard.frames.map((frame, index) => ({
        panel_index: index + 1,
        speech: frame.spokenText,
        action: frame.visualAction,
        product_placement: frame.productPlacement,
        physical_plan: frame.physicalPlan || null,
        reference_transfer: frame.referenceTransfer || null,
        wardrobe: frame.wardrobe,
        camera: frame.camera,
        environment: frame.environment,
      })),
    }),
    "For every panel, verify that the visible image obeys the expected action, physical_plan, and reference_transfer. Each required_support_prop must be visibly present where planned; it is allowed alongside the client product and must not be treated as a copied source product. A product must be held or rest on a visible surface; it must never float. Reject a generic centered talking-head image when the expected camera composition requires visible proof props, hands, lap, table, or another reference geometry. If reference_transfer says the source product is removed or replaced, reject only the copied source product or a competing branded package.",
  ].join("\n");
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
