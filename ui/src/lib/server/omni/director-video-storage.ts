import { getS3Config, isS3Configured, putObjectToS3 } from "@/lib/server/s3-storage";

const DEFAULT_MAX_VIDEO_BYTES = 80 * 1024 * 1024;

export type StoredDirectorVideo = {
  url: string;
  byteSize: number;
  contentType: string;
};

export async function storeDirectorReferenceVideo(input: {
  legacyScenarioId: number;
  videoUrl: string;
}): Promise<StoredDirectorVideo | null> {
  const config = getS3Config();
  if (!isS3Configured(config)) return null;

  const response = await fetch(input.videoUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Reference video download failed: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "video/mp4";
  if (!isLikelyVideoContentType(contentType)) {
    throw new Error(`Reference video response is not a video: ${contentType}`);
  }
  const contentLength = Number(response.headers.get("content-length") || 0);
  const maxBytes = getMaxVideoBytes();
  if (contentLength > maxBytes) {
    throw new Error(`Reference video is too large: ${contentLength} bytes`);
  }

  const body = Buffer.from(await response.arrayBuffer());
  if (body.byteLength > maxBytes) {
    throw new Error(`Reference video is too large: ${body.byteLength} bytes`);
  }

  const key = [
    "omni-legacy-reference-videos",
    "old-db",
    `scenario-${input.legacyScenarioId}`,
    `${Date.now()}_reference.mp4`,
  ].join("/");
  const url = await putObjectToS3(config, key, body, normalizeVideoContentType(contentType));
  return { url, byteSize: body.byteLength, contentType };
}

function getMaxVideoBytes() {
  const mb = Number(process.env.OMNI_DIRECTOR_VIDEO_MAX_MB || 80);
  return Number.isFinite(mb) && mb > 0 ? mb * 1024 * 1024 : DEFAULT_MAX_VIDEO_BYTES;
}

function normalizeVideoContentType(value: string) {
  return value.toLowerCase().startsWith("video/") ? value : "video/mp4";
}

function isLikelyVideoContentType(value: string) {
  const normalized = value.toLowerCase();
  return normalized.startsWith("video/") || normalized.includes("octet-stream");
}
