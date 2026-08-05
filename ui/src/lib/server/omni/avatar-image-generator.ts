import { saveAvatarReference } from "./avatar-reference-storage";

const DEFAULT_COMETAPI_BASE_URL = "https://api.cometapi.com";
const GPT_IMAGE_MODEL = "gpt-image-2";
const DEFAULT_IMAGE_SIZE = "1024x1024";
const DEFAULT_IMAGE_QUALITY = "low";
const DEFAULT_OUTPUT_FORMAT = "jpeg";

export type GeneratedAvatarReference = {
  referenceUrl: string;
  revisedPrompt: string | null;
};

function getCometApiKey() {
  const key = process.env.COMETAPI_KEY || "";
  if (!key) {
    throw new Error("COMETAPI_KEY is not configured");
  }
  return key;
}

function getCometApiBaseUrl() {
  return (process.env.COMETAPI_BASE_URL || DEFAULT_COMETAPI_BASE_URL).replace(/\/$/, "");
}

function buildAvatarImagePrompt(prompt: string) {
  return [
    "A photorealistic portrait reference image for a reusable UGC video avatar.",
    "The subject must look like a real, authentic smartphone creator. Natural skin texture with visible pores, subtle peach fuzz, skin grain, and minor natural skin imperfections. Unretouched, no beauty filters, no airbrushed or plastic skin, no waxy CGI look.",
    "Soft diffused window lighting from the side to bring out micro-texture and natural depth. Shot on Sony A7R V with 85mm f/1.4 lens, sharp focus on eyes, shallow depth of field, natural skin tone variation.",
    "Single person only, looking directly at the camera. Neutral real-life background, vertical portrait crop, no text overlays, no watermarks, no logos.",
    "Keep the outfit, age, face, hair, expression, and basic appearance faithful to this brief:",
    prompt.trim(),
  ].join("\n");
}

function extractBase64Image(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return null;
  const first = data[0];
  if (!first || typeof first !== "object") return null;
  const b64 = (first as { b64_json?: unknown }).b64_json;
  return typeof b64 === "string" && b64 ? b64 : null;
}

function extractRevisedPrompt(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return null;
  const first = data[0];
  if (!first || typeof first !== "object") return null;
  const revisedPrompt = (first as { revised_prompt?: unknown }).revised_prompt;
  return typeof revisedPrompt === "string" ? revisedPrompt : null;
}

export async function generateAvatarReferenceWithGptImage2(projectId: number, prompt: string): Promise<GeneratedAvatarReference> {
  const response = await fetch(`${getCometApiBaseUrl()}/v1/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getCometApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GPT_IMAGE_MODEL,
      prompt: buildAvatarImagePrompt(prompt),
      quality: DEFAULT_IMAGE_QUALITY,
      size: DEFAULT_IMAGE_SIZE,
      output_format: DEFAULT_OUTPUT_FORMAT,
      n: 1,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? JSON.stringify((payload as { error: unknown }).error)
        : await response.text().catch(() => "");
    throw new Error(`CometAPI gpt-image-2 avatar generation failed: ${response.status} ${message}`);
  }

  const b64 = extractBase64Image(payload);
  if (!b64) {
    throw new Error("CometAPI gpt-image-2 response did not include b64_json");
  }

  const ref = await saveAvatarReference({
    projectId,
    fileName: `gpt-image-2-avatar-${projectId}.jpg`,
    contentType: "image/jpeg",
    buffer: Buffer.from(b64, "base64"),
    requireS3: true,
  });

  return {
    referenceUrl: ref.url,
    revisedPrompt: extractRevisedPrompt(payload),
  };
}
