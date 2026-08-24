import { randomUUID } from "node:crypto";
import { buildStoryboardImagePrompt } from "./omni-storyboard-image-prompt";
import {
  uploadStoryboardRepairCandidate,
  uploadVersionedStoryboardImage,
} from "./omni-storyboard-image-storage";
import { createKieStoryboardImage, isKieStoryboardImagePendingError } from "./kie-omni-client";
import { recordKieGenerationCost } from "./omni-generation-costs";
import {
  STORYBOARD_PIP_REFERENCE_FRAMES_PER_SEGMENT,
  STORYBOARD_REFERENCE_FRAMES_PER_SEGMENT,
} from "./storyboard-reference-frame-timing";
import type { DirectorBrief } from "./director-analysis-types";
import { isCollagePictureInPictureReference } from "./director-layout-contract";
import type { OmniStoryboardSegment } from "@/lib/omni/storyboard/omni-storyboard-types";
import type { OmniGenerationProvider } from "@/lib/omni/provider";
import type { ProductRole } from "@/lib/omni/creative-contract";
import type { StoryboardVisionValidation } from "@/lib/omni/storyboard/omni-storyboard-vision-types";
import { validateStoryboardImage } from "./storyboard-vision-validator";
import {
  getStoryboardVisionRepairInstructions,
  isStoryboardVisionValidationInconclusive,
} from "./storyboard-vision-contract";
import { resolveStoryboardRepairMode } from "./storyboard-qa-contract";
import { isAvatarFreeReferenceScene, isFacelessReferenceScene, isObjectOnlyReferenceScene, resolveReferenceSceneMode, type ReferenceSceneMode } from "./omni-reference-scene-mode";
import { resolveReferenceFormatMode } from "./omni-reference-format-mode";
import {
  canAttemptStoryboardImageGeneration,
  normalizeStoryboardImageGenerationAttemptCount,
  resolveStoryboardImageGenerationAttempt,
  withStoryboardGenerationAttemptCount,
} from "./storyboard-repair-limit";
import type { ReferenceSegmentPlan } from "./reference-segment-plan";

const DEFAULT_COMETAPI_BASE_URL = "https://api.cometapi.com";
const STORYBOARD_IMAGE_MODEL = "gpt-image-2";
const DEFAULT_IMAGE_SIZE = "1024x1024";
const DEFAULT_IMAGE_QUALITY = "low";
const DEFAULT_OUTPUT_FORMAT = "jpeg";

type StoryboardReferenceFile = {
  url: string;
  required: boolean;
  kind: "avatar" | "canonical" | "repair" | "product" | "director";
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
  productRole?: ProductRole;
  avatarReferenceUrl: string | null;
  productReferenceUrls?: readonly string[];
  directorReferenceImageUrls?: readonly string[];
  canonicalStoryboardReferenceUrl?: string | null;
  previousStoryboardReferenceUrl?: string | null;
  previousRepairInstructions?: readonly string[];
  previousGenerationAttemptCount?: number;
  directorBrief?: DirectorBrief | null;
  referenceSegmentPlan?: ReferenceSegmentPlan | null;
  referenceSceneMode?: ReferenceSceneMode;
  generationProvider?: OmniGenerationProvider;
  pendingKieStoryboardTaskId?: string | null;
  referenceSafetyInstructions?: readonly string[];
  deferVisualQa?: boolean;
};

type GeneratedStoryboardImage = { body: Buffer; contentType: string; storageToken: string };

export class StoryboardImageRepairExhaustedError extends Error {
  readonly generationAttemptCount: number;

  constructor(input: { validation: StoryboardVisionValidation | null; generationAttemptCount: number; failureReason?: string | null }) {
    super(input.failureReason?.trim() || `Storyboard image did not pass visual QA after ${input.generationAttemptCount} generation attempts: ${JSON.stringify(input.validation)}`);
    this.name = "StoryboardImageRepairExhaustedError";
    this.generationAttemptCount = input.generationAttemptCount;
  }
}

export function isStoryboardImageRepairExhaustedError(error: unknown): error is StoryboardImageRepairExhaustedError {
  return error instanceof StoryboardImageRepairExhaustedError;
}

export async function generateStoryboardImage(input: StoryboardImageInput) {
  if (process.env.OMNI_STORYBOARD_IMAGE_GENERATION === "false") return null;
  const referenceSceneMode = input.referenceSceneMode || resolveReferenceSceneMode(input.directorBrief);
  const facelessReferenceScene = isFacelessReferenceScene(referenceSceneMode);
  const avatarFreeReferenceScene = isAvatarFreeReferenceScene(referenceSceneMode);
  const objectOnlyReferenceScene = isObjectOnlyReferenceScene(referenceSceneMode);
  const avatarReferenceUrl = cleanUrl(input.avatarReferenceUrl);
  if (!avatarReferenceUrl && !avatarFreeReferenceScene) {
    throw new Error("Storyboard image generation requires the avatar reference image used for Omni character_id");
  }
  const productReferenceUrls = uniqueUrls(input.productReferenceUrls || []);
  const directorReferenceImageUrls = uniqueUrls(input.directorReferenceImageUrls || [])
    .slice(0, isCollagePictureInPictureReference(input.directorBrief || null)
      ? STORYBOARD_PIP_REFERENCE_FRAMES_PER_SEGMENT
      : STORYBOARD_REFERENCE_FRAMES_PER_SEGMENT);
  const canonicalStoryboardReferenceUrl = cleanUrl(input.canonicalStoryboardReferenceUrl);
  const previousStoryboardReferenceUrl = cleanUrl(input.previousStoryboardReferenceUrl);

  const preparedInput = {
    ...input,
    avatarReferenceUrl,
    productReferenceUrls,
    directorReferenceImageUrls,
    canonicalStoryboardReferenceUrl,
    previousStoryboardReferenceUrl,
    directorBrief: input.directorBrief,
    referenceSceneMode,
  };
  const referenceSafetyInstructions = uniqueStrings(input.referenceSafetyInstructions || []);
  let repairInstructions = uniqueStrings([
    ...referenceSafetyInstructions,
    ...(input.previousRepairInstructions || []),
  ]);
  let repairStoryboardReferenceUrl = previousStoryboardReferenceUrl;
  let generationAttemptCount = normalizeStoryboardImageGenerationAttemptCount(input.previousGenerationAttemptCount);
  let pendingKieStoryboardTaskId = input.pendingKieStoryboardTaskId || null;
  let lastValidation: StoryboardVisionValidation | null = null;
  while (true) {
    const attempt = resolveStoryboardImageGenerationAttempt({
      previousAttemptCount: generationAttemptCount,
      pendingKieTaskId: pendingKieStoryboardTaskId,
      usesKie: input.generationProvider === "kie-ai",
    });
    if (!attempt.shouldAttempt) break;
    let generated: GeneratedStoryboardImage;
    try {
      generated = input.generationProvider === "kie-ai"
        ? await generateKieStoryboardImageBytes({
          ...preparedInput,
          previousStoryboardReferenceUrl: repairStoryboardReferenceUrl,
          pendingKieStoryboardTaskId: attempt.resumesPendingKieTask ? pendingKieStoryboardTaskId : null,
          repairInstructions,
        })
        : await generateCometStoryboardImageBytes({
          ...preparedInput,
          previousStoryboardReferenceUrl: repairStoryboardReferenceUrl,
          repairInstructions,
        });
    } catch (error) {
      if (isKieStoryboardImagePendingError(error)) {
        error.storyboardRepairReferenceUrl = repairStoryboardReferenceUrl;
        error.storyboardRepairInstructions = repairInstructions;
        error.storyboardGenerationAttemptCount = attempt.generationAttemptCount;
      }
      throw error;
    }
    pendingKieStoryboardTaskId = null;
    generationAttemptCount = attempt.generationAttemptCount;
    if (input.deferVisualQa) {
      if (!generated.body.length) throw new Error("Generated storyboard image is empty");
      return uploadVersionedStoryboardImage({
        ...input,
        body: generated.body,
        contentType: generated.contentType,
        generationAttemptCount,
        generationToken: generated.storageToken,
      });
    }
    const validationInput = {
      imageUrl: toDataUrl(generated.body, generated.contentType),
      avatarReferenceUrl,
      referenceSceneMode,
      storyboard: input.storyboard,
      productName: input.productName,
      canonicalStoryboardReferenceUrl,
      directorReferenceImageUrls,
      referenceFormatMode: resolveReferenceFormatMode(input.directorBrief),
      wardrobeContinuity: input.directorBrief?.wardrobe_continuity,
    };
    let validation: StoryboardVisionValidation;
    try {
      validation = await validateStoryboardImage(validationInput);
      if (isStoryboardVisionValidationInconclusive(validation)) {
        validation = await validateStoryboardImage(validationInput);
      }
    } catch (error) {
      throw withStoryboardGenerationAttemptCount(error, generationAttemptCount);
    }
    lastValidation = validation;
    if (validation.status === "pass") {
      try {
        return await uploadVersionedStoryboardImage({
          ...input,
          body: generated.body,
          contentType: generated.contentType,
          generationAttemptCount,
          generationToken: generated.storageToken,
        });
      } catch (error) {
        throw withStoryboardGenerationAttemptCount(error, generationAttemptCount);
      }
    }
    const retryInstructions = getStoryboardVisionRepairInstructions(validation);
    const automaticRetryInstructions = isStoryboardVisionValidationInconclusive(validation)
      ? [objectOnlyReferenceScene
        ? "Re-render the same storyboard plan with every panel clear, readable, and only the approved surface, product, and conceptual props visible; do not introduce a person, hands, face, or head."
        : facelessReferenceScene
        ? "Re-render the same storyboard plan with every panel clear, readable, and only the approved hands, crop, and physical props visible; do not introduce a face or head."
        : referenceSceneMode === "voiceover_broll"
        ? "Re-render the same storyboard plan with independent B-roll panels led by the saved silent avatar and off-camera narration; do not introduce talking-head or lip-sync. Incidental visible people are allowed only when the reference frame requires them."
        : "Re-render the same storyboard plan with every panel clear, readable, and the avatar fully visible for continuity QA."]
      : retryInstructions;
    if (!automaticRetryInstructions.length || !canAttemptStoryboardImageGeneration(generationAttemptCount)) {
      throw new StoryboardImageRepairExhaustedError({ validation: lastValidation, generationAttemptCount });
    }
    const repairMode = resolveStoryboardRepairMode(validation.panels.flatMap((panel) => panel.violations));
    if (repairMode === "patch") {
      try {
        repairStoryboardReferenceUrl = await uploadStoryboardRepairCandidate({
          ...input,
          body: generated.body,
          contentType: generated.contentType,
          generationAttemptCount,
          generationToken: generated.storageToken,
        });
      } catch (error) {
        throw withStoryboardGenerationAttemptCount(error, generationAttemptCount);
      }
    } else {
      repairStoryboardReferenceUrl = null;
    }
    repairInstructions = uniqueStrings([
      ...referenceSafetyInstructions,
      ...repairInstructions,
      ...automaticRetryInstructions,
    ]);
  }
  throw new StoryboardImageRepairExhaustedError({ validation: lastValidation, generationAttemptCount });
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
  productRole?: ProductRole;
  avatarReferenceUrl: string | null;
  productReferenceUrls: readonly string[];
  directorReferenceImageUrls: readonly string[];
  canonicalStoryboardReferenceUrl: string | null;
  previousStoryboardReferenceUrl: string | null;
  directorBrief?: DirectorBrief | null;
  referenceSegmentPlan?: ReferenceSegmentPlan | null;
  referenceSceneMode: ReferenceSceneMode;
  pendingKieStoryboardTaskId?: string | null;
  repairInstructions: readonly string[];
}): Promise<GeneratedStoryboardImage> {
  const inputUrls = [
    ...(input.avatarReferenceUrl && !isAvatarFreeReferenceScene(input.referenceSceneMode) ? [input.avatarReferenceUrl] : []),
    ...(input.canonicalStoryboardReferenceUrl ? [input.canonicalStoryboardReferenceUrl] : []),
    ...(input.previousStoryboardReferenceUrl ? [input.previousStoryboardReferenceUrl] : []),
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
  return { body, contentType, storageToken: generated.task.id };
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
  productRole?: ProductRole;
  avatarReferenceUrl: string | null;
  productReferenceUrls: readonly string[];
  directorReferenceImageUrls: readonly string[];
  canonicalStoryboardReferenceUrl: string | null;
  previousStoryboardReferenceUrl: string | null;
  directorBrief?: DirectorBrief | null;
  referenceSegmentPlan?: ReferenceSegmentPlan | null;
  referenceSceneMode: ReferenceSceneMode;
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
  return { body: Buffer.from(b64, "base64"), contentType: "image/jpeg", storageToken: randomUUID() };
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
  productRole?: ProductRole;
  avatarReferenceUrl: string | null;
  productReferenceUrls: readonly string[];
  directorReferenceImageUrls: readonly string[];
  canonicalStoryboardReferenceUrl: string | null;
  previousStoryboardReferenceUrl: string | null;
  directorBrief?: DirectorBrief | null;
  referenceSegmentPlan?: ReferenceSegmentPlan | null;
  referenceSceneMode: ReferenceSceneMode;
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
      previousStoryboardReferenceUrl: downloaded.find((item) => item.kind === "repair")?.url || null,
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

function toDataUrl(body: Buffer, contentType: string) {
  return `data:${contentType};base64,${body.toString("base64")}`;
}

function buildReferenceFiles(input: {
  avatarReferenceUrl: string | null;
  productReferenceUrls: readonly string[];
  directorReferenceImageUrls: readonly string[];
  canonicalStoryboardReferenceUrl: string | null;
  previousStoryboardReferenceUrl: string | null;
  referenceSceneMode: ReferenceSceneMode;
}): StoryboardReferenceFile[] {
  return [
    input.avatarReferenceUrl && !isAvatarFreeReferenceScene(input.referenceSceneMode)
      ? { url: input.avatarReferenceUrl, required: true, kind: "avatar" as const }
      : null,
    input.canonicalStoryboardReferenceUrl
      ? { url: input.canonicalStoryboardReferenceUrl, required: true, kind: "canonical" as const }
      : null,
    input.previousStoryboardReferenceUrl
      ? { url: input.previousStoryboardReferenceUrl, required: true, kind: "repair" as const }
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

function uniqueStrings(values: readonly string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeImageContentType(value: string | null) {
  const contentType = (value || "").split(";")[0]?.trim().toLowerCase();
  if (contentType === "image/jpeg" || contentType === "image/png" || contentType === "image/webp") {
    return contentType;
  }
  return null;
}
