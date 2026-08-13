const DEFAULT_FILE_UPLOAD_BASE_URL = "https://kieai.redpandaai.co";
const KIE_FILE_UPLOAD_ATTEMPTS = 3;
const KIE_FILE_UPLOAD_TIMEOUT_MS = 30_000;
const MAX_BASE64_FALLBACK_BYTES = 10 * 1024 * 1024;

export type KieUploadedFile = {
  url: string;
  raw: Record<string, unknown>;
};

function getApiKey() {
  const key = process.env.KIE_API_KEY || process.env.KIE_AI_API_KEY || "";
  if (!key.trim()) throw new Error("KIE_API_KEY is not configured");
  return key.trim();
}

function getFileUploadBaseUrl() {
  return (process.env.KIE_FILE_UPLOAD_BASE_URL || DEFAULT_FILE_UPLOAD_BASE_URL).replace(/\/$/, "");
}

export async function uploadKieFileFromUrl(fileUrl: string, uploadPath = "omni/avatars"): Promise<KieUploadedFile> {
  const cleanUrl = fileUrl.trim();
  if (!/^https?:\/\//i.test(cleanUrl)) throw new Error("KIE file upload requires a public HTTP URL");

  const response = await fetch(`${getFileUploadBaseUrl()}/api/file-url-upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fileUrl: cleanUrl,
      uploadPath,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(KIE_FILE_UPLOAD_TIMEOUT_MS),
  });

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || !payload) {
    throw new Error(`KIE file upload failed: ${response.status} ${formatUploadError(payload)}`);
  }

  const data = isRecord(payload.data) ? payload.data : {};
  const uploadedUrl = pickString(data, ["downloadUrl", "fileUrl"]);
  if (!uploadedUrl) throw new Error(`KIE file upload did not return file URL: ${JSON.stringify(payload)}`);

  return { url: uploadedUrl, raw: payload };
}

/**
 * KIE's URL import occasionally cannot fetch an otherwise public image.
 * The fallback still uploads to KIE and returns its temporary URL for the model.
 */
export async function uploadKieImageFromUrlWithFallback(input: {
  fileUrl: string;
  uploadPath?: string;
}): Promise<KieUploadedFile> {
  const uploadPath = input.uploadPath || "omni/avatars";
  let urlUploadError: unknown = null;

  try {
    return await retryFileUpload(() => uploadKieFileFromUrl(input.fileUrl, uploadPath));
  } catch (error) {
    urlUploadError = error;
  }

  try {
    const image = await downloadPublicImage(input.fileUrl);
    return await retryFileUpload(() => uploadKieImageBuffer({
      body: image.body,
      fileName: image.fileName,
      mimeType: image.mimeType,
      uploadPath,
    }));
  } catch (fallbackError) {
    throw new Error(
      `KIE URL upload failed: ${formatKieUploadError(urlUploadError)}; ` +
      `KIE Base64 fallback failed: ${formatKieUploadError(fallbackError)}`
    );
  }
}

export async function uploadKieImageBuffer(input: {
  body: Buffer;
  fileName: string;
  mimeType?: string;
  uploadPath?: string;
}): Promise<KieUploadedFile> {
  const mimeType = input.mimeType || "image/jpeg";
  const response = await fetch(`${getFileUploadBaseUrl()}/api/file-base64-upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      base64Data: `data:${mimeType};base64,${input.body.toString("base64")}`,
      uploadPath: input.uploadPath || "omni/continuity-frames",
      fileName: input.fileName,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(KIE_FILE_UPLOAD_TIMEOUT_MS),
  });

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || !payload) {
    throw new Error(`KIE file upload failed: ${response.status} ${formatUploadError(payload)}`);
  }

  const data = isRecord(payload.data) ? payload.data : {};
  const uploadedUrl = pickString(data, ["downloadUrl", "fileUrl"]);
  if (!uploadedUrl) throw new Error(`KIE file upload did not return file URL: ${JSON.stringify(payload)}`);

  return { url: uploadedUrl, raw: payload };
}

function formatUploadError(payload: Record<string, unknown> | null) {
  if (!payload) return "empty response";
  const nestedError = isRecord(payload.error) ? payload.error : null;
  return pickString(payload, ["msg", "message", "error"]) ||
    (nestedError ? pickString(nestedError, ["msg", "message", "error"]) || JSON.stringify(nestedError) : JSON.stringify(payload));
}

async function retryFileUpload<T>(operation: () => Promise<T>) {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= KIE_FILE_UPLOAD_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < KIE_FILE_UPLOAD_ATTEMPTS) await sleep(attempt * 250);
    }
  }
  throw lastError;
}

async function downloadPublicImage(fileUrl: string) {
  const response = await fetch(fileUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(KIE_FILE_UPLOAD_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`source image download failed: ${response.status}`);

  const mimeType = (response.headers.get("content-type") || "image/jpeg").split(";", 1)[0].trim();
  if (!mimeType.startsWith("image/")) throw new Error(`source image has unsupported content type: ${mimeType}`);

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_BASE64_FALLBACK_BYTES) throw new Error(`source image exceeds ${MAX_BASE64_FALLBACK_BYTES} bytes`);
  const body = Buffer.from(await response.arrayBuffer());
  if (!body.length) throw new Error("source image is empty");
  if (body.length > MAX_BASE64_FALLBACK_BYTES) throw new Error(`source image exceeds ${MAX_BASE64_FALLBACK_BYTES} bytes`);

  return {
    body,
    mimeType,
    fileName: getFileName(fileUrl, mimeType),
  };
}

function getFileName(fileUrl: string, mimeType: string) {
  const sourceName = new URL(fileUrl).pathname.split("/").pop() || "kie-input";
  const safeName = sourceName.replace(/[^a-z0-9._-]/giu, "_").slice(0, 120) || "kie-input";
  if (/\.[a-z0-9]{2,5}$/iu.test(safeName)) return safeName;
  return `${safeName}.${mimeType.split("/")[1] || "jpg"}`;
}

function formatKieUploadError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickString(data: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
