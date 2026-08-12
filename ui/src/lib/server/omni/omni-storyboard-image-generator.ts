import {
  uploadOmniGeneratedScriptStoryboardImageBufferToS3,
  uploadOmniImageBufferToS3,
} from "./omni-video-storage";
import { buildStoryboardImagePrompt } from "./omni-storyboard-image-prompt";
import { createKieStoryboardImage } from "./kie-omni-client";
import { recordKieGenerationCost } from "./omni-generation-costs";
import {
  STORYBOARD_PIP_REFERENCE_FRAMES_PER_SEGMENT,
  STORYBOARD_REFERENCE_FRAMES_PER_SEGMENT,
} from "./storyboard-reference-frame-timing";
import type { DirectorBrief } from "./director-analysis-types";
import { isCollagePictureInPictureReference } from "./director-layout-contract";
import type { OmniStoryboardSegment } from "@/lib/omni/storyboard/omni-storyboard-types";
import type { OmniGenerationProvider } from "@/lib/omni/provider";
import type { StoryboardVisionValidation } from "@/lib/omni/storyboard/omni-storyboard-vision-types";
import { validateStoryboardImage } from "./storyboard-vision-validator";
import {
  getStoryboardVisionRepairInstructions,
  isStoryboardVisionValidationInconclusive,
} from "./storyboard-vision-contract";

const DEFAULT_COMETAPI_BASE_URL = "https://api.cometapi.com";
const STORYBOARD_IMAGE_MODEL = "gpt-image-2";
const DEFAULT_IMAGE_SIZE = "1024x1024";
const DEFAULT_IMAGE_QUALITY = "low";
const DEFAULT_OUTPUT_FORMAT = "jpeg";

type StoryboardReferenceFile = {
  url: string;
  required: boolean;
  kind: "avatar" | "canonical" | "product" | "director";
};

type StoryboardImageInput = {
  projectId: number;
  productId: number;
  reelId?: number;
  scriptId?: number;
  segmentIndex: number;
  storyboard: OmniStoryboardSegment;
  productName: string;
  productPhysicalContract?: string | null;
  avatarReferenceUrl: string | null;
  productReferenceUrls?: readonly string[];
  directorReferenceImageUrls?: readonly string[];
  canonicalStoryboardReferenceUrl?: string | null;
  directorBrief?: DirectorBrief | null;
  generationProvider?: OmniGenerationProvider;
  pendingKieStoryboardTaskId?: string | null;
  referenceSafetyInstructions?: readonly string[];
};

type GeneratedStoryboardImage = {
  body: Buffer;
  contentType: string;
};

export async function generateStoryboardImage(input: StoryboardImageInput) {
  if (process.env.OMNI_STORYBOARD_IMAGE_GENERATION === "false") return null;
  const avatarReferenceUrl = cleanUrl(input.avatarReferenceUrl);
  if (!avatarReferenceUrl) {
    throw new Error("Storyboard image generation requires the avatar reference image used for Omni character_id");
  }
  const productReferenceUrls = uniqueUrls(input.productReferenceUrls || []);
  const directorReferenceImageUrls = uniqueUrls(input.directorReferenceImageUrls || [])
    .slice(0, isCollagePictureInPictureReference(input.directorBrief || null)
      ? STORYBOARD_PIP_REFERENCE_FRAMES_PER_SEGMENT
      : STORYBOARD_REFERENCE_FRAMES_PER_SEGMENT);
  const canonicalStoryboardReferenceUrl = cleanUrl(input.canonicalStoryboardReferenceUrl);

  const preparedInput = {
    ...input,
    avatarReferenceUrl,
    productReferenceUrls,
    directorReferenceImageUrls,
    canonicalStoryboardReferenceUrl,
    directorBrief: input.directorBrief,
  };
  const referenceSafetyInstructions = [...(input.referenceSafetyInstructions || [])];
  let repairInstructions = referenceSafetyInstructions;
  let lastValidation: StoryboardVisionValidation | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const generated = input.generationProvider === "kie-ai"
      ? await generateKieStoryboardImageBytes({
        ...preparedInput,
        pendingKieStoryboardTaskId: attempt === 0 ? input.pendingKieStoryboardTaskId : null,
        repairInstructions,
      })
      : await generateCometStoryboardImageBytes({ ...preparedInput, repairInstructions });
    const validationInput = {
      imageUrl: toDataUrl(generated.body, generated.contentType),
      avatarReferenceUrl,
      storyboard: input.storyboard,
      productName: input.productName,
      canonicalStoryboardReferenceUrl,
    };
    let validation = await validateStoryboardImage(validationInput);
    if (isStoryboardVisionValidationInconclusive(validation)) {
      validation = await validateStoryboardImage(validationInput);
    }
    lastValidation = validation;
    if (validation.status === "pass") {
      return uploadStoryboardImage({ ...input, body: generated.body, contentType: generated.contentType });
    }
    const retryInstructions = getStoryboardVisionRepairInstructions(validation);
    const automaticRetryInstructions = isStoryboardVisionValidationInconclusive(validation)
      ? ["Re-render the same storyboard plan with every panel clear, readable, and the avatar fully visible for continuity QA."]
      : retryInstructions;
    if (attempt === 0 && automaticRetryInstructions.length) {
      repairInstructions = [...referenceSafetyInstructions, ...automaticRetryInstructions];
      continue;
    }
    if (isStoryboardVisionValidationInconclusive(validation)) {
      throw new Error("Storyboard vision validation remained inconclusive after automatic retries");
    }
    break;
  }
  throw new Error(`Storyboard image blocked by vision validation: ${JSON.stringify(lastValidation)}`);
}

async function generateKieStoryboardImageBytes(input: {
  projectId: number;
  productId: number;
  reelId?: number;
  scriptId?: number;
  segmentIndex: number;
  storyboard: OmniStoryboardSegment;
  productName: string;
  productPhysicalContract?: string | null;
  avatarReferenceUrl: string;
  productReferenceUrls: readonly string[];
  directorReferenceImageUrls: readonly string[];
  canonicalStoryboardReferenceUrl: string | null;
  directorBrief?: DirectorBrief | null;
  pendingKieStoryboardTaskId?: string | null;
  repairInstructions: readonly string[];
}): Promise<GeneratedStoryboardImage> {
  const inputUrls = [
    input.avatarReferenceUrl,
    ...(input.canonicalStoryboardReferenceUrl ? [input.canonicalStoryboardReferenceUrl] : []),
    ...input.productReferenceUrls,
    ...input.directorReferenceImageUrls,
  ].slice(0, 16);
  const generated = await createKieStoryboardImage({
    prompt: buildStoryboardImagePrompt(input),
    inputUrls,
    aspectRatio: "auto",
    taskId: input.pendingKieStoryboardTaskId,
  });
  await recordKieGenerationCost({
    projectId: input.projectId,
    productId: input.productId,
    generatedScriptId: input.scriptId,
    reelId: input.reelId,
    operation: "storyboard",
    taskId: generated.task.id,
    status: generated.task.status,
    model: generated.model,
    raw: generated.task.raw,
  }).catch((error) => console.error("KIE storyboard cost record failed:", error));
  const response = await fetch(generated.imageUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`KIE storyboard image download failed: ${response.status}`);
  const body = Buffer.from(await response.arrayBuffer());
  const contentType = normalizeImageContentType(response.headers.get("content-type")) || "image/jpeg";
  return { body, contentType };
}

async function generateCometStoryboardImageBytes(input: {
  projectId: number;
  productId: number;
  reelId?: number;
  scriptId?: number;
  segmentIndex: number;
  storyboard: OmniStoryboardSegment;
  productName: string;
  productPhysicalContract?: string | null;
  avatarReferenceUrl: string;
  productReferenceUrls: readonly string[];
  directorReferenceImageUrls: readonly string[];
  canonicalStoryboardReferenceUrl: string | null;
  directorBrief?: DirectorBrief | null;
  repairInstructions: readonly string[];
}): Promise<GeneratedStoryboardImage> {
  const response = await createStoryboardImage(input);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload
      ? JSON.stringify((payload as { error: unknown }).error)
      : await response.text().catch(() => "");
    throw new Error(`CometAPI gpt-image-2 storyboard generation failed: ${response.status} ${message}`);
  }
  const b64 = extractBase64Image(payload);
  if (!b64) throw new Error("CometAPI gpt-image-2 storyboard response did not include b64_json");
  return { body: Buffer.from(b64, "base64"), contentType: "image/jpeg" };
}

async function createStoryboardImage(input: {
  projectId: number;
  productId: number;
  reelId?: number;
  scriptId?: number;
  segmentIndex: number;
  storyboard: OmniStoryboardSegment;
  productName: string;
  productPhysicalContract?: string | null;
  avatarReferenceUrl: string;
  productReferenceUrls: readonly string[];
  directorReferenceImageUrls: readonly string[];
  canonicalStoryboardReferenceUrl: string | null;
  directorBrief?: DirectorBrief | null;
  repairInstructions: readonly string[];
}) {
  const references = buildReferenceFiles(input).slice(0, 16);
  if (references.length) {
    const downloaded = await downloadReferenceFiles(references);
    const promptInput = {
      ...input,
      directorReferenceImageUrls: downloaded
        .filter((item) => item.kind === "director")
        .map((item) => item.url),
      canonicalStoryboardReferenceUrl: downloaded.find((item) => item.kind === "canonical")?.url || null,
    };
    const form = new FormData();
    form.set("model", STORYBOARD_IMAGE_MODEL);
    form.set("prompt", buildStoryboardImagePrompt(promptInput));
    form.set("quality", DEFAULT_IMAGE_QUALITY);
    form.set("size", DEFAULT_IMAGE_SIZE);
    form.set("output_format", DEFAULT_OUTPUT_FORMAT);
    form.set("n", "1");
    const imageField = getImageEditFieldName();
    downloaded.forEach((item) => form.append(imageField, item.file));
    return fetch(`${getCometApiBaseUrl()}/v1/images/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getCometApiKey()}` },
      body: form,
      cache: "no-store",
    });
  }

  return fetch(`${getCometApiBaseUrl()}/v1/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getCometApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: STORYBOARD_IMAGE_MODEL,
      prompt: buildStoryboardImagePrompt(input),
      quality: DEFAULT_IMAGE_QUALITY,
      size: DEFAULT_IMAGE_SIZE,
      output_format: DEFAULT_OUTPUT_FORMAT,
      n: 1,
    }),
    cache: "no-store",
  });
}

async function uploadStoryboardImage(input: {
  projectId: number;
  reelId?: number;
  scriptId?: number;
  segmentIndex: number;
  body: Buffer;
  contentType: string;
}) {
  const extension = input.contentType.split("/")[1] || "jpg";
  const fileName = `storyboard_${String(input.segmentIndex).padStart(2, "0")}.${extension}`;
  if (typeof input.reelId === "number") {
    return uploadOmniImageBufferToS3({
      projectId: input.projectId,
      reelId: input.reelId,
      segmentIndex: input.segmentIndex,
      fileName,
      body: input.body,
      contentType: input.contentType,
    });
  }
  if (typeof input.scriptId === "number") {
    return uploadOmniGeneratedScriptStoryboardImageBufferToS3({
      projectId: input.projectId,
      scriptId: input.scriptId,
      segmentIndex: input.segmentIndex,
      fileName,
      body: input.body,
      contentType: input.contentType,
    });
  }
  throw new Error("Storyboard image generation requires reelId or scriptId storage target");
}

function toDataUrl(body: Buffer, contentType: string) {
  return `data:${contentType};base64,${body.toString("base64")}`;
}

function buildReferenceFiles(input: {
  avatarReferenceUrl: string;
  productReferenceUrls: readonly string[];
  directorReferenceImageUrls: readonly string[];
  canonicalStoryboardReferenceUrl: string | null;
}): StoryboardReferenceFile[] {
  return [
    { url: input.avatarReferenceUrl, required: true, kind: "avatar" },
    input.canonicalStoryboardReferenceUrl
      ? { url: input.canonicalStoryboardReferenceUrl, required: true, kind: "canonical" as const }
      : null,
    ...input.productReferenceUrls.map((url) => ({ url, required: true, kind: "product" as const })),
    ...input.directorReferenceImageUrls.map((url) => ({ url, required: false, kind: "director" as const })),
  ].filter((item): item is StoryboardReferenceFile => Boolean(item));
}

async function downloadReferenceFiles(references: readonly StoryboardReferenceFile[]) {
  const downloaded = [];
  for (let index = 0; index < references.length; index += 1) {
    const reference = references[index];
    const file = await downloadReferenceFile(reference, index).catch((error) => {
      if (reference.required) throw error;
      console.warn("Optional storyboard reference image skipped:", {
        url: reference.url,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    });
    if (file) downloaded.push({ ...reference, file });
  }
  return downloaded;
}

async function downloadReferenceFile(reference: StoryboardReferenceFile, index: number) {
  const response = await fetch(reference.url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Storyboard reference image ${index + 1} download failed: ${response.status}`);
  const contentType = normalizeImageContentType(response.headers.get("content-type"));
  if (!contentType) {
    throw new Error(`Storyboard reference image ${index + 1} is not a supported image`);
  }
  const extension = contentType.split("/")[1] || "jpg";
  return new File([await response.blob()], `storyboard_reference_${index + 1}.${extension}`, { type: contentType });
}

function getCometApiKey() {
  const key = process.env.COMETAPI_KEY || "";
  if (!key.trim()) throw new Error("COMETAPI_KEY is not configured");
  return key.trim();
}

function getCometApiBaseUrl() {
  return (process.env.COMETAPI_BASE_URL || DEFAULT_COMETAPI_BASE_URL).replace(/\/$/, "");
}

function getImageEditFieldName() {
  return (process.env.COMETAPI_IMAGE_EDIT_IMAGE_FIELD || "image[]").trim() || "image[]";
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

function cleanUrl(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function uniqueUrls(values: readonly string[]) {
  const seen = new Set<string>();
  return values
    .map((value) => cleanUrl(value))
    .filter((value): value is string => Boolean(value))
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

function normalizeImageContentType(value: string | null) {
  const contentType = (value || "").split(";")[0]?.trim().toLowerCase();
  if (contentType === "image/jpeg" || contentType === "image/png" || contentType === "image/webp") {
    return contentType;
  }
  return null;
}
