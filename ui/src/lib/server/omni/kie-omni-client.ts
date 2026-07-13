const DEFAULT_BASE_URL = "https://api.kie.ai";
const DEFAULT_VIDEO_MODEL = "gemini-omni-video";
const DEFAULT_CHARACTER_MODEL = "gemini-omni-character";
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
  return postCreateTask(
    {
      model: getCharacterModel(),
      input: {
        character_name: input.characterName || undefined,
        image_urls: [input.imageUrl],
        descriptions: input.description,
        audio_ids: input.audioIds || [],
      },
    },
    "character create"
  );
}

export async function createKieOmniVideoTask(input: KieOmniVideoInput) {
  return postCreateTask(
    {
      model: getVideoModel(),
      input: {
        prompt: input.prompt,
        image_urls: input.imageUrls,
        duration: String(input.duration),
        aspect_ratio: input.aspectRatio,
        resolution: input.resolution,
        seed: 0,
        audio_ids: [],
        video_list: [],
        character_ids: input.characterIds,
      },
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

function normalizeTask(payload: Record<string, unknown>): KieOmniTask {
  const data = isRecord(payload.data) ? payload.data : payload;
  const characterId = pickString(data, ["characterId", "character_id"]) || undefined;
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
