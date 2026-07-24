import { uploadOmniImageBufferToS3 } from "./omni-video-storage";
import type { OmniStoryboardSegment } from "@/lib/omni/storyboard/omni-storyboard-types";

const DEFAULT_COMETAPI_BASE_URL = "https://api.cometapi.com";
const STORYBOARD_IMAGE_MODEL = "gpt-image-2";
const DEFAULT_IMAGE_SIZE = "1024x1024";
const DEFAULT_IMAGE_QUALITY = "low";
const DEFAULT_OUTPUT_FORMAT = "jpeg";

export async function generateStoryboardImage(input: {
  projectId: number;
  reelId: number;
  segmentIndex: number;
  storyboard: OmniStoryboardSegment;
  productName: string;
  avatarReferenceUrl: string | null;
}) {
  if (process.env.OMNI_STORYBOARD_IMAGE_GENERATION === "false") return null;
  const avatarReferenceUrl = cleanUrl(input.avatarReferenceUrl);
  if (!avatarReferenceUrl) {
    throw new Error("Storyboard image generation requires the avatar reference image used for Omni character_id");
  }

  const response = await fetch(`${getCometApiBaseUrl()}/v1/images/generations`, {
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

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload
      ? JSON.stringify((payload as { error: unknown }).error)
      : await response.text().catch(() => "");
    throw new Error(`CometAPI gpt-image-2 storyboard generation failed: ${response.status} ${message}`);
  }

  const b64 = extractBase64Image(payload);
  if (!b64) throw new Error("CometAPI gpt-image-2 storyboard response did not include b64_json");

  return uploadOmniImageBufferToS3({
    projectId: input.projectId,
    reelId: input.reelId,
    segmentIndex: input.segmentIndex,
    fileName: `storyboard_${String(input.segmentIndex).padStart(2, "0")}.jpg`,
    body: Buffer.from(b64, "base64"),
    contentType: "image/jpeg",
  });
}

function buildStoryboardImagePrompt(input: {
  segmentIndex: number;
  storyboard: OmniStoryboardSegment;
  productName: string;
  avatarReferenceUrl: string | null;
}) {
  const avatarReferenceUrl = cleanUrl(input.avatarReferenceUrl);
  return [
    "Создай одну квадратную production storyboard картинку, clean contact sheet из пяти кадров для вертикального UGC видео.",
    "Каждый кадр должен быть отдельной панелью с номером, короткой русской репликой, стрелками движения и обозначениями звуковых эффектов.",
    "Можно рисовать субтитры, стрелки, эффекты и SFX подписи. Не рисуй интерфейс соцсетей, кнопки приложения или водяные знаки.",
    "Главный герой в каждом кадре должен быть тем же человеком, что и avatar reference. Не меняй лицо, возраст, телосложение, волосы и общий типаж между кадрами.",
    `Avatar reference для героя: ${avatarReferenceUrl}.`,
    `Продукт: ${input.productName}.`,
    `Сегмент: ${input.segmentIndex}.`,
    ...input.storyboard.frames.map((frame, index) =>
      [
        `Кадр ${index + 1}, ${index * 2}-${(index + 1) * 2} сек:`,
        `реплика "${frame.spokenText}";`,
        `действие ${frame.visualAction};`,
        `камера ${frame.camera};`,
        `продукт ${frame.productPlacement};`,
        `эффект ${frame.sfxNotes}.`,
      ].join(" ")
    ),
  ].join("\n");
}

function getCometApiKey() {
  const key = process.env.COMETAPI_KEY || "";
  if (!key.trim()) throw new Error("COMETAPI_KEY is not configured");
  return key.trim();
}

function getCometApiBaseUrl() {
  return (process.env.COMETAPI_BASE_URL || DEFAULT_COMETAPI_BASE_URL).replace(/\/$/, "");
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
