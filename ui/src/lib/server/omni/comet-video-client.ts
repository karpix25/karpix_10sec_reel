const DEFAULT_BASE_URL = "https://api.cometapi.com";
const DEFAULT_MODEL = "omni-fast";
const DEFAULT_REFERENCE_IMAGE_FIELD = "image";
const TERMINAL_STATUSES = new Set(["completed", "failed", "error"]);

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

export function shouldSendCometReferenceImage() {
  return ["1", "true", "yes"].includes(String(process.env.COMETAPI_SEND_REFERENCE_IMAGE || "").toLowerCase());
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

export function isCometTerminalStatus(status: string) {
  return TERMINAL_STATUSES.has(status.toLowerCase());
}

export async function createCometOmniVideoTask(input: {
  prompt: string;
  seconds: number;
  aspectRatio?: string;
  resolution?: string;
  referenceImage?: CometReferenceImage | null;
}) {
  const form = new FormData();
  form.append("model", DEFAULT_MODEL);
  form.append("prompt", input.prompt);
  form.append("seconds", String(input.seconds));
  form.append("aspect_ratio", input.aspectRatio || "9:16");
  form.append("resolution", input.resolution || "720p");
  if (input.referenceImage?.url) {
    const image = await downloadReferenceImage(input.referenceImage.url);
    form.append(
      input.referenceImage.fieldName || getCometReferenceImageFieldName(),
      new Blob([image.body], { type: image.contentType }),
      input.referenceImage.fileName || image.fileName
    );
  }

  const response = await fetch(`${getBaseUrl()}/v1/videos`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getApiKey()}` },
    body: form,
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`CometAPI Omni create failed: ${response.status} ${await parseError(response)}`);
  }

  return normalizeTask((await response.json()) as Record<string, unknown>);
}

async function downloadReferenceImage(url: string) {
  const response = await fetch(url, { cache: "no-store" });
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

export async function retrieveCometOmniVideoTask(taskId: string) {
  const response = await fetch(`${getBaseUrl()}/v1/videos/${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${getApiKey()}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`CometAPI Omni retrieve failed: ${response.status} ${await parseError(response)}`);
  }

  return normalizeTask((await response.json()) as Record<string, unknown>);
}

export async function downloadCometOmniVideo(taskId: string) {
  const response = await fetch(`${getBaseUrl()}/v1/videos/${encodeURIComponent(taskId)}/content`, {
    headers: { Authorization: `Bearer ${getApiKey()}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`CometAPI Omni download failed: ${response.status} ${await parseError(response)}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("video/mp4")) {
    throw new Error(`CometAPI Omni download returned ${contentType || "unknown content type"}`);
  }

  return Buffer.from(await response.arrayBuffer());
}
