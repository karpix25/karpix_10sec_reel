import { uploadKieFileFromUrl } from "./kie-file-upload-client";

const DEFAULT_BASE_URL = "https://api.kie.ai";
const DEFAULT_VIDEO_MODEL = "gemini-omni-video";
const DEFAULT_CHARACTER_MODEL = "gemini-omni-character";
const CHARACTER_POLL_INTERVAL_MS = 5_000;
const CHARACTER_POLL_ATTEMPTS = 18;
const CHARACTER_CREATE_ATTEMPTS = 8;
const TERMINAL_STATUSES = new Set(["completed", "success", "done", "failed", "error", "fail"]);

export type KieOmniTask = {
  id: string;
  status: string;
  video_url?: string;
  character_id?: string;
  error?: unknown;
  raw: Record<string, unknown>;
};

export type KieOmniVideoInput = {
  prompt: string;
  duration: 8 | 10;
  aspectRatio: "9:16";
  resolution: string;
  imageUrls: string[];
  characterIds: string[];
};

function getApiKey() {
  const key = process.env.KIE_API_KEY || process.env.KIE_AI_API_KEY || "";
  if (!key.trim()) throw new Error("KIE_API_KEY is not configured");
  return key.trim();
}

function getBaseUrl() {
  return (process.env.KIE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function getVideoModel() {
  return (process.env.KIE_GEMINI_OMNI_VIDEO_MODEL || DEFAULT_VIDEO_MODEL).trim() || DEFAULT_VIDEO_MODEL;
}

function getCharacterModel() {
  return (process.env.KIE_GEMINI_OMNI_CHARACTER_MODEL || DEFAULT_CHARACTER_MODEL).trim() || DEFAULT_CHARACTER_MODEL;
}

function getCharacterCreateAttempts() {
  const parsed = Number.parseInt(process.env.KIE_CHARACTER_CREATE_ATTEMPTS || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : CHARACTER_CREATE_ATTEMPTS;
}

async function parseError(response: Response) {
  const text = await response.text().catch(() => "");
  try {
    const data = JSON.parse(text);
    return data?.error?.message || data?.message || data?.msg || text;
  } catch {
    return text || response.statusText;
  }
}

async function postCreateTask(payload: Record<string, unknown>, action: string) {
  const response = await fetch(`${getBaseUrl()}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`KIE Gemini Omni ${action} failed: ${response.status} ${await parseError(response)}`);
  }

  return normalizeTask((await response.json()) as Record<string, unknown>);
}

export async function createKieOmniCharacter(input: {
  characterName?: string | null;
  imageUrl: string;
  description: string;
  audioIds?: string[];
}) {
  const attempts = getCharacterCreateAttempts();
  const uploadedImage = await uploadKieFileFromUrl(input.imageUrl);
  const characterInput = { ...input, imageUrl: uploadedImage.url };
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const task = await postCreateTask(buildCharacterCreatePayload(characterInput), "character create");
      if (task.character_id) return withCharacterImageUpload(task, input.imageUrl, uploadedImage.url, uploadedImage.raw);
      return withCharacterImageUpload(
        await waitForKieOmniCharacter(task.id),
        input.imageUrl,
        uploadedImage.url,
        uploadedImage.raw
      );
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;
      console.warn("KIE Gemini Omni character create retry:", {
        attempt,
        attempts,
        error: formatKieError(error),
      });
      await sleep(CHARACTER_POLL_INTERVAL_MS);
    }
  }

  throw new Error(
    `KIE Gemini Omni character create did not return characterId after ${attempts} attempts: ${formatKieError(lastError)}`
  );
}

export async function createKieOmniVideoTask(input: KieOmniVideoInput) {
  return postCreateTask(
    {
      model: getVideoModel(),
      input: omitEmptyFields({
        prompt: input.prompt,
        image_urls: input.imageUrls,
        duration: String(input.duration),
        aspect_ratio: input.aspectRatio,
        resolution: input.resolution,
        seed: 0,
        character_ids: input.characterIds,
      }),
    },
    "video create"
  );
}

export async function retrieveKieOmniTask(taskId: string) {
  const response = await fetch(`${getBaseUrl()}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${getApiKey()}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`KIE Gemini Omni retrieve failed: ${response.status} ${await parseError(response)}`);
  }

  return normalizeTask((await response.json()) as Record<string, unknown>);
}

export async function downloadKieOmniVideo(taskId: string) {
  const task = await retrieveKieOmniTask(taskId);
  if (!task.video_url) throw new Error(`KIE Gemini Omni task ${taskId} has no video URL yet`);
  const response = await fetch(task.video_url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`KIE Gemini Omni video download failed: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export function isKieTerminalStatus(status: string) {
  return TERMINAL_STATUSES.has(status.toLowerCase());
}

function buildCharacterCreatePayload(input: {
  characterName?: string | null;
  imageUrl: string;
  description: string;
  audioIds?: string[];
}) {
  return {
    model: getCharacterModel(),
    input: omitEmptyFields({
      character_name: input.characterName || undefined,
      image_urls: [input.imageUrl],
      descriptions: input.description,
      audio_ids: input.audioIds,
    }),
  };
}

function withCharacterImageUpload(
  task: KieOmniTask,
  sourceImageUrl: string,
  uploadedImageUrl: string,
  uploadPayload: Record<string, unknown>
) {
  const kieFileUpload = { sourceImageUrl, uploadedImageUrl, payload: uploadPayload };
  return {
    ...task,
    raw: { ...task.raw, kieFileUpload },
  };
}

function omitEmptyFields(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => {
      if (value === null || value === undefined) return false;
      if (typeof value === "string") return Boolean(value.trim());
      if (Array.isArray(value)) return value.length > 0;
      return true;
    })
  );
}

async function waitForKieOmniCharacter(taskId: string) {
  let lastTask = await retrieveKieOmniTask(taskId);
  for (let attempt = 0; attempt < CHARACTER_POLL_ATTEMPTS; attempt += 1) {
    if (lastTask.character_id) return lastTask;
    if (lastTask.status === "failed") {
      throw new Error(`KIE Gemini Omni character create failed: ${formatKieError(lastTask.error)}`);
    }
    await sleep(CHARACTER_POLL_INTERVAL_MS);
    lastTask = await retrieveKieOmniTask(taskId);
  }

  throw new Error(`KIE Gemini Omni character create timed out for task ${taskId}`);
}

function normalizeTask(payload: Record<string, unknown>): KieOmniTask {
  const data = isRecord(payload.data) ? payload.data : payload;
  const characterId = extractCharacterId(data) || undefined;
  const id =
    pickString(data, ["taskId", "task_id", "id"]) ||
    pickString(payload, ["taskId", "task_id", "id"]) ||
    characterId;
  if (!id) throw new Error(`KIE Gemini Omni did not return task id: ${JSON.stringify(payload)}`);

  return {
    id,
    status: normalizeStatus(pickString(data, ["status", "state", "taskStatus"]) || (characterId ? "completed" : "queued")),
    video_url: extractVideoUrl(data) || undefined,
    character_id: characterId,
    error: data.error || data.failMsg || data.message || payload.error,
    raw: payload,
  };
}

function normalizeStatus(status: string) {
  const lowered = status.toLowerCase();
  if (["success", "done"].includes(lowered)) return "completed";
  if (lowered === "fail") return "failed";
  return lowered || "queued";
}

function extractVideoUrl(data: Record<string, unknown>) {
  const direct = pickString(data, ["video_url", "videoUrl", "url", "result"]);
  if (direct && isVideoUrl(direct)) return direct;

  const resultJson = pickString(data, ["resultJson", "response"]);
  if (!resultJson) return direct || undefined;
  try {
    const parsed = JSON.parse(resultJson) as Record<string, unknown>;
    const urls = parsed.resultUrls;
    if (Array.isArray(urls) && typeof urls[0] === "string") return urls[0];
    return pickString(parsed, ["video_url", "videoUrl", "url", "result"]);
  } catch {
    return direct || undefined;
  }
}

function extractCharacterId(data: Record<string, unknown>) {
  const direct = pickString(data, ["characterId", "character_id"]);
  if (direct) return direct;

  const resultJson = pickString(data, ["resultJson", "response"]);
  if (!resultJson) return null;
  try {
    const parsed = JSON.parse(resultJson) as Record<string, unknown>;
    return pickString(parsed, ["characterId", "character_id"]);
  } catch {
    return null;
  }
}

function formatKieError(error: unknown) {
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
    if (typeof value === "number") return String(value);
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isVideoUrl(value: string) {
  return /^https?:\/\//i.test(value) && /\.(mp4|mov|webm|m4v)(\?|$)/i.test(value);
}
