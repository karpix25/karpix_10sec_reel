const SCRAPECREATORS_BASE_URL = "https://api.scrapecreators.com";

export type ScrapeCreatorsInstagramVideo = {
  videoUrl: string;
  metadata: Record<string, unknown>;
};

export async function resolveInstagramVideoWithScrapeCreators(reelsUrl: string): Promise<ScrapeCreatorsInstagramVideo> {
  const apiKey =
    process.env.SCRAPECREATORS_API_KEY ||
    process.env.SCRAPE_CREATORS_API_KEY ||
    process.env.SCRAPECREATORS_KEY ||
    process.env.CREATORSCRAPER_API_KEY ||
    "";
  if (!apiKey.trim()) throw new Error("SCRAPECREATORS_API_KEY is not configured");

  const requestUrl = new URL(getScrapeCreatorsInstagramPostEndpoint(), getScrapeCreatorsBaseUrl());
  requestUrl.searchParams.set("url", reelsUrl);
  requestUrl.searchParams.set("trim", "false");
  if (String(process.env.SCRAPECREATORS_DOWNLOAD_MEDIA || "").toLowerCase() === "true") {
    requestUrl.searchParams.set("download_media", "true");
  }

  const response = await fetch(requestUrl, {
    headers: { "x-api-key": apiKey.trim() },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(`ScrapeCreators Instagram post failed: ${response.status} ${formatProviderError(payload)}`);
  }

  return extractScrapeCreatorsInstagramVideo(payload);
}

export function extractScrapeCreatorsInstagramVideo(payload: unknown): ScrapeCreatorsInstagramVideo {
  const media = getMediaNode(payload);
  const videoUrl = pickString(media, ["video_url", "videoUrl", "url"]);
  if (!videoUrl) throw new Error("ScrapeCreators response did not include data.xdt_shortcode_media.video_url");

  return {
    videoUrl,
    metadata: {
      shortcode: media.shortcode || null,
      id: media.id || null,
      typename: media.__typename || null,
      thumbnail_src: media.thumbnail_src || null,
      display_url: media.display_url || null,
      dimensions: media.dimensions || null,
      video_duration: media.video_duration || null,
      video_play_count: media.video_play_count || null,
      video_view_count: media.video_view_count || null,
      is_video: media.is_video ?? null,
    },
  };
}

function getScrapeCreatorsBaseUrl() {
  return (process.env.SCRAPECREATORS_BASE_URL || SCRAPECREATORS_BASE_URL).replace(/\/$/, "");
}

function getScrapeCreatorsInstagramPostEndpoint() {
  return process.env.SCRAPECREATORS_INSTAGRAM_POST_ENDPOINT || "/v1/instagram/post";
}

function getMediaNode(payload: unknown): Record<string, unknown> {
  const root = isRecord(payload) ? payload : {};
  const data = isRecord(root.data) ? root.data : root;
  const candidate = data.xdt_shortcode_media || data.shortcode_media || root.xdt_shortcode_media;
  if (isRecord(candidate)) return candidate;
  throw new Error("ScrapeCreators response did not include xdt_shortcode_media");
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
