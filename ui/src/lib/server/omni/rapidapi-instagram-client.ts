const RAPIDAPI_INSTAGRAM_HOST = "instagram-social-api.p.rapidapi.com";
const RAPIDAPI_REQUEST_TIMEOUT_MS = 45_000;

export type RapidApiInstagramVideo = {
  videoUrl: string;
  metadata: Record<string, unknown>;
};

export async function resolveInstagramVideoWithRapidApi(reelsUrl: string): Promise<RapidApiInstagramVideo> {
  const apiKey = process.env.RAPIDAPI_KEY?.trim();
  if (!apiKey) throw new Error("RAPIDAPI_KEY is not configured");

  const requestUrl = new URL(getRapidApiInstagramEndpoint(), getRapidApiBaseUrl());
  const parameter = requestUrl.pathname.includes("/reels")
    ? "username_or_id_or_url"
    : "code_or_id_or_url";
  requestUrl.searchParams.set(parameter, reelsUrl);

  const response = await fetch(requestUrl, {
    headers: {
      "x-rapidapi-key": apiKey,
      "x-rapidapi-host": getRapidApiHost(),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(RAPIDAPI_REQUEST_TIMEOUT_MS),
  });
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(`RapidAPI Instagram post failed: ${response.status} ${formatProviderError(payload)}`);
  }

  return extractRapidApiInstagramVideo(payload);
}

export function extractRapidApiInstagramVideo(payload: unknown): RapidApiInstagramVideo {
  const item = getMediaItem(payload);
  const videoUrl = pickVideoUrl(item);
  if (!videoUrl) throw new Error("RapidAPI Instagram response did not include a direct video URL");

  return {
    videoUrl,
    metadata: {
      provider: "rapidapi",
      shortcode: pickString(item, ["code", "shortcode"]),
      id: pickString(item, ["id", "pk", "media_id"]),
      thumbnail_src: pickString(item, ["thumbnail_url", "thumbnail_src", "display_url"]),
      video_duration: item.video_duration ?? item.duration ?? null,
      is_video: item.media_type === 2 || item.is_video === true,
    },
  };
}

function getRapidApiBaseUrl() {
  return `https://${getRapidApiHost()}`;
}

function getRapidApiHost() {
  return (process.env.RAPIDAPI_INSTAGRAM_HOST || RAPIDAPI_INSTAGRAM_HOST)
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
}

function getRapidApiInstagramEndpoint() {
  return process.env.RAPIDAPI_INSTAGRAM_ENDPOINT || "/v1/post_info";
}

function getMediaItem(payload: unknown): Record<string, unknown> {
  const root = isRecord(payload) ? payload : {};
  const data = root.data;
  const dataItems = isRecord(data) && Array.isArray(data.items) ? data.items[0] : null;
  const dataArray = Array.isArray(data) ? data[0] : null;
  const rootItems = Array.isArray(root.items) ? root.items[0] : null;
  const candidates: unknown[] = [
    dataItems,
    dataArray,
    rootItems,
    data,
    root,
  ];
  const item = candidates.find(isRecord);
  if (item) return item;
  throw new Error("RapidAPI Instagram response did not include media data");
}

function pickVideoUrl(item: Record<string, unknown>) {
  const versions = item.video_versions;
  if (Array.isArray(versions)) {
    const version = versions.find(isRecord);
    const url = version && pickString(version, ["url"]);
    if (url) return url;
  }
  return pickString(item, ["video_url", "videoUrl", "media_url", "url"]);
}

function formatProviderError(payload: unknown) {
  if (!isRecord(payload)) return "";
  return pickString(payload, ["message", "error", "detail"]) || JSON.stringify(payload).slice(0, 240);
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
