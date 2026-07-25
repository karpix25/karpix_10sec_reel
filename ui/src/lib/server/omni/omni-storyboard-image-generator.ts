import {
  uploadOmniGeneratedScriptStoryboardImageBufferToS3,
  uploadOmniImageBufferToS3,
} from "./omni-video-storage";
import type { OmniStoryboardSegment } from "@/lib/omni/storyboard/omni-storyboard-types";

const DEFAULT_COMETAPI_BASE_URL = "https://api.cometapi.com";
const STORYBOARD_IMAGE_MODEL = "gpt-image-2";
const DEFAULT_IMAGE_SIZE = "1024x1024";
const DEFAULT_IMAGE_QUALITY = "low";
const DEFAULT_OUTPUT_FORMAT = "jpeg";

export async function generateStoryboardImage(input: {
  projectId: number;
  reelId?: number;
  scriptId?: number;
  segmentIndex: number;
  storyboard: OmniStoryboardSegment;
  productName: string;
  avatarReferenceUrl: string | null;
  productReferenceUrls?: readonly string[];
  previousStoryboardReferenceUrl?: string | null;
}) {
  if (process.env.OMNI_STORYBOARD_IMAGE_GENERATION === "false") return null;
  const avatarReferenceUrl = cleanUrl(input.avatarReferenceUrl);
  if (!avatarReferenceUrl) {
    throw new Error("Storyboard image generation requires the avatar reference image used for Omni character_id");
  }
  const productReferenceUrls = uniqueUrls(input.productReferenceUrls || []);
  if (!productReferenceUrls.length) {
    throw new Error("Storyboard image generation requires a real product reference image");
  }
  const previousStoryboardReferenceUrl = cleanUrl(input.previousStoryboardReferenceUrl);

  const response = await createStoryboardImage({
    ...input,
    avatarReferenceUrl,
    productReferenceUrls,
    previousStoryboardReferenceUrl,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload
      ? JSON.stringify((payload as { error: unknown }).error)
      : await response.text().catch(() => "");
    throw new Error(`CometAPI gpt-image-2 storyboard generation failed: ${response.status} ${message}`);
  }

  const b64 = extractBase64Image(payload);
  if (!b64) throw new Error("CometAPI gpt-image-2 storyboard response did not include b64_json");
  const body = Buffer.from(b64, "base64");
  const fileName = `storyboard_${String(input.segmentIndex).padStart(2, "0")}.jpg`;

  if (typeof input.reelId === "number") {
    return uploadOmniImageBufferToS3({
      projectId: input.projectId,
      reelId: input.reelId,
      segmentIndex: input.segmentIndex,
      fileName,
      body,
      contentType: "image/jpeg",
    });
  }

  if (typeof input.scriptId === "number") {
    return uploadOmniGeneratedScriptStoryboardImageBufferToS3({
      projectId: input.projectId,
      scriptId: input.scriptId,
      segmentIndex: input.segmentIndex,
      fileName,
      body,
      contentType: "image/jpeg",
    });
  }

  throw new Error("Storyboard image generation requires reelId or scriptId storage target");
}

function buildStoryboardImagePrompt(input: {
  segmentIndex: number;
  storyboard: OmniStoryboardSegment;
  productName: string;
  avatarReferenceUrl: string | null;
  productReferenceUrls?: readonly string[];
  previousStoryboardReferenceUrl?: string | null;
}) {
  const avatarReferenceUrl = cleanUrl(input.avatarReferenceUrl);
  const productReferenceUrls = uniqueUrls(input.productReferenceUrls || []);
  const previousStoryboardReferenceUrl = cleanUrl(input.previousStoryboardReferenceUrl);
  const productRange = productReferenceUrls.length > 1 ? `2-${productReferenceUrls.length + 1}` : "2";
  const previousReferenceIndex = productReferenceUrls.length + 2;
  return [
    "Создай одну квадратную production storyboard картинку, clean contact sheet из пяти кадров для вертикального UGC видео.",
    "Используй входные изображения как реальные визуальные референсы, а не как текстовые ссылки.",
    "Изображение 1 - наш аватар: лицо, возраст, телосложение, волосы и общий типаж героя.",
    `Изображения ${productRange} - реальный продукт: форма, цвет, упаковка, материал и размер.`,
    previousStoryboardReferenceUrl
      ? `Изображение ${previousReferenceIndex} - предыдущая раскадровка этого же ролика. Используй ее как continuity reference: тот же стиль, персонаж, одежда, свет, окружение, масштаб продукта и contact sheet layout без резких скачков. Не копируй старые действия и текст.`
      : "",
    "Каждый кадр должен быть отдельной визуальной панелью с маленьким номером кадра и русской фразой кадра как субтитром.",
    "Можно рисовать только те стрелки, переходы, эффекты и SFX-подсказки, которые помогают повторить раскадровку в видео. Не добавляй интерфейс соцсетей, кнопки приложения или водяные знаки.",
    "Главный герой в каждом кадре должен быть тем же человеком, что и на изображении 1. Не меняй лицо, возраст, телосложение, волосы и общий типаж между кадрами.",
    "Одежда, стиль, свет и окружение должны оставаться одинаковыми во всех пяти кадрах.",
    "Если описание кадра говорит, что продукт виден, прорисуй именно продукт из входных изображений продукта, четко и детально.",
    `Avatar reference URL: ${avatarReferenceUrl}.`,
    productReferenceUrls.length ? `Product reference URLs: ${productReferenceUrls.join(", ")}.` : "",
    previousStoryboardReferenceUrl ? `Previous storyboard reference URL: ${previousStoryboardReferenceUrl}.` : "",
    `Продукт: ${input.productName}.`,
    `Сегмент: ${input.segmentIndex}.`,
    ...input.storyboard.frames.map((frame, index) =>
      [
        `Кадр ${index + 1}, ${index * 2}-${(index + 1) * 2} сек:`,
        `субтитр "${frame.spokenText}";`,
        `действие ${frame.visualAction};`,
        `камера ${frame.camera};`,
        `окружение ${frame.environment};`,
        `одежда ${frame.wardrobe};`,
        `продукт ${frame.productPlacement};`,
        `звук ${frame.sfxNotes}.`,
      ].join(" ")
    ),
  ].join("\n");
}

async function createStoryboardImage(input: {
  projectId: number;
  reelId?: number;
  scriptId?: number;
  segmentIndex: number;
  storyboard: OmniStoryboardSegment;
  productName: string;
  avatarReferenceUrl: string;
  productReferenceUrls: readonly string[];
  previousStoryboardReferenceUrl: string | null;
}) {
  const references = [
    input.avatarReferenceUrl,
    ...input.productReferenceUrls,
    input.previousStoryboardReferenceUrl,
  ].filter((url): url is string => Boolean(url)).slice(0, 16);
  if (references.length) {
    const form = new FormData();
    form.set("model", STORYBOARD_IMAGE_MODEL);
    form.set("prompt", buildStoryboardImagePrompt(input));
    form.set("quality", DEFAULT_IMAGE_QUALITY);
    form.set("size", DEFAULT_IMAGE_SIZE);
    form.set("output_format", DEFAULT_OUTPUT_FORMAT);
    form.set("n", "1");
    const imageField = getImageEditFieldName();
    const files = await Promise.all(references.map((url, index) => downloadReferenceFile(url, index)));
    files.forEach((file) => form.append(imageField, file));
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

async function downloadReferenceFile(url: string, index: number) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Storyboard reference image ${index + 1} download failed: ${response.status}`);
  }
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
