const DEFAULT_BASE_URL = "https://api.cometapi.com";
const DEFAULT_MODEL = "omni-fast";
const DEFAULT_REFERENCE_IMAGE_FIELD = "input_reference";
const DEFAULT_REFERENCE_IMAGE_TRANSPORT = "url";
const TERMINAL_STATUSES = new Set(["completed", "failed", "error"]);

const CREATE_TIMEOUT_MS = 120_000;
const RETRIEVE_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 300_000;
const REFERENCE_IMAGE_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 3;
const GET_RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export type CometVideoTask = {
  id: string;
  model?: string;
  object?: string;
  status: string;
  progress?: number;
  created_at?: number;
  completed_at?: number;
  video_url?: string;
  error?: unknown;
  raw: Record<string, unknown>;
};

export type CometReferenceImage = {
  url: string;
  fieldName?: string;
  fileName?: string;
  role?: string;
};

function getApiKey() {
  const key = process.env.COMETAPI_KEY || "";
  if (!key.trim()) throw new Error("COMETAPI_KEY is not configured");
  return key.trim();
}

function getBaseUrl() {
  return (process.env.COMETAPI_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

export function getCometReferenceImageFieldName() {
  return (process.env.COMETAPI_REFERENCE_IMAGE_FIELD || DEFAULT_REFERENCE_IMAGE_FIELD).trim() || DEFAULT_REFERENCE_IMAGE_FIELD;
}

export function getCometReferenceImageTransport() {
  const value = (process.env.COMETAPI_REFERENCE_IMAGE_TRANSPORT || DEFAULT_REFERENCE_IMAGE_TRANSPORT).trim().toLowerCase();
  return value === "file" ? "file" : "url";
}

export function shouldSendCometReferenceImage() {
  const value = String(process.env.COMETAPI_SEND_REFERENCE_IMAGE || "").toLowerCase();
  if (!value) return true;
  return !["0", "false", "no"].includes(value);
}

function normalizeTask(data: Record<string, unknown>): CometVideoTask {
  const id = String(data.id || data.task_id || "").trim();
  if (!id) throw new Error(`CometAPI Omni did not return task id: ${JSON.stringify(data)}`);
  return {
    id,
    model: typeof data.model === "string" ? data.model : undefined,
    object: typeof data.object === "string" ? data.object : undefined,
    status: String(data.status || "queued"),
    progress: typeof data.progress === "number" ? data.progress : undefined,
    created_at: typeof data.created_at === "number" ? data.created_at : undefined,
    completed_at: typeof data.completed_at === "number" ? data.completed_at : undefined,
    video_url: typeof data.video_url === "string" ? data.video_url : undefined,
    error: data.error,
    raw: data,
  };
}

async function parseError(response: Response) {
  const text = await response.text().catch(() => "");
  try {
    const data = JSON.parse(text);
    return data?.error?.message || data?.message || text;
  } catch {
    return text || response.statusText;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelayMs(attempt: number, retryAfterHeader: string | null) {
  const retryAfterSeconds = Number.parseInt(String(retryAfterHeader || ""), 10);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 && retryAfterSeconds <= 60) {
    return retryAfterSeconds * 1000;
  }
  return Math.min(1000 * 2 ** attempt, 10_000);
}

/**
 * GET requests retry on transient statuses and network errors.
 * POST video creation retries only on 429: higher statuses may mean the task
 * was already created, and a blind retry would bill twice.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: { label: string; timeoutMs: number; retryableStatuses?: Set<number> }
) {
  const retryableStatuses = options.retryableStatuses ?? GET_RETRYABLE_STATUSES;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      await sleep(getRetryDelayMs(attempt - 1, null));
    }
    try {
      const response = await fetch(url, {
        ...init,
        cache: "no-store",
        signal: AbortSignal.timeout(options.timeoutMs),
      });
      if (response.ok || !retryableStatuses.has(response.status)) {
        return response;
      }
      lastError = new Error(`${options.label} failed: ${response.status} ${await parseError(response)}`);
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        lastError = new Error(`${options.label} timed out after ${options.timeoutMs} ms`);
      } else {
        lastError = error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function isCometTerminalStatus(status: string) {
  return TERMINAL_STATUSES.has(status.toLowerCase());
}

export async function createCometOmniVideoTask(input: {
  prompt: string;
  seconds: number;
  aspectRatio?: string;
  resolution?: string;
  referenceImage?: CometReferenceImage | null;
  referenceImages?: CometReferenceImage[];
}) {
  const form = new FormData();
  form.append("model", DEFAULT_MODEL);
  form.append("prompt", input.prompt);
  form.append("seconds", String(input.seconds));
  form.append("aspect_ratio", input.aspectRatio || "9:16");
  form.append("resolution", input.resolution || "720p");
  const referenceImages = [
    ...(input.referenceImages || []),
    ...(input.referenceImage ? [input.referenceImage] : []),
  ].filter((image) => image.url);

  for (const referenceImage of referenceImages) {
    const fieldName = referenceImage.fieldName || getCometReferenceImageFieldName();
    if (getCometReferenceImageTransport() === "url") {
      form.append(fieldName, referenceImage.url);
    } else {
      const image = await downloadReferenceImage(referenceImage.url);
      form.append(
        fieldName,
        new Blob([image.body], { type: image.contentType }),
        referenceImage.fileName || buildRoleFileName(referenceImage.role, image.fileName)
      );
    }
  }

  const response = await fetchWithRetry(
    `${getBaseUrl()}/v1/videos`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${getApiKey()}` },
      body: form,
    },
    { label: "CometAPI Omni create", timeoutMs: CREATE_TIMEOUT_MS, retryableStatuses: new Set([429]) }
  );
  if (!response.ok) {
    throw new Error(`CometAPI Omni create failed: ${response.status} ${await parseError(response)}`);
  }

  return normalizeTask((await response.json()) as Record<string, unknown>);
}

async function downloadReferenceImage(url: string) {
  const response = await fetchWithRetry(url, {}, { label: "CometAPI Omni reference image download", timeoutMs: REFERENCE_IMAGE_TIMEOUT_MS });
  if (!response.ok) {
    throw new Error(`CometAPI Omni reference image download failed: ${response.status} ${url}`);
  }

  const contentType = response.headers.get("content-type") || "image/jpeg";
  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error(`CometAPI Omni reference URL is not an image: ${contentType}`);
  }

  return {
    body: await response.arrayBuffer(),
    contentType,
    fileName: buildReferenceImageFileName(url, contentType),
  };
}

function buildReferenceImageFileName(url: string, contentType: string) {
  const extension = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).pop();
    if (last && /\.[a-z0-9]{2,5}$/i.test(last)) return last;
  } catch {
    // Keep the stable fallback below.
  }
  return `avatar-reference.${extension}`;
}

function buildRoleFileName(role: string | undefined, fallback: string) {
  if (!role) return fallback;
  const extension = fallback.split(".").pop() || "jpg";
  return `${role}-reference.${extension}`;
}

export async function retrieveCometOmniVideoTask(taskId: string) {
  const response = await fetchWithRetry(
    `${getBaseUrl()}/v1/videos/${encodeURIComponent(taskId)}`,
    { headers: { Authorization: `Bearer ${getApiKey()}` } },
    { label: "CometAPI Omni retrieve", timeoutMs: RETRIEVE_TIMEOUT_MS }
  );
  if (!response.ok) {
    throw new Error(`CometAPI Omni retrieve failed: ${response.status} ${await parseError(response)}`);
  }

  return normalizeTask((await response.json()) as Record<string, unknown>);
}

export async function downloadCometOmniVideo(taskId: string) {
  const response = await fetchWithRetry(
    `${getBaseUrl()}/v1/videos/${encodeURIComponent(taskId)}/content`,
    { headers: { Authorization: `Bearer ${getApiKey()}` } },
    { label: "CometAPI Omni download", timeoutMs: DOWNLOAD_TIMEOUT_MS }
  );
  if (!response.ok) {
    throw new Error(`CometAPI Omni download failed: ${response.status} ${await parseError(response)}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("video/mp4")) {
    throw new Error(`CometAPI Omni download returned ${contentType || "unknown content type"}`);
  }

  return Buffer.from(await response.arrayBuffer());
}
