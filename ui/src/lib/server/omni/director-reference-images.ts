import type { OmniDirectorAnalysis } from "./director-analysis-types";

const IMAGE_URL_KEYS = new Set([
  "thumbnail_src",
  "thumbnail_url",
  "thumbnailUrl",
  "display_url",
  "displayUrl",
  "image_url",
  "imageUrl",
  "preview_url",
  "previewUrl",
]);

const IMAGE_URL_ARRAY_KEYS = new Set([
  "director_reference_image_urls",
  "directorReferenceImageUrls",
  "reference_image_urls",
  "referenceImageUrls",
]);

export function extractDirectorReferenceImageUrls(input: {
  directorAnalysis?: Pick<OmniDirectorAnalysis, "scrapecreators_payload" | "source_snapshot"> | null;
  sourceSnapshot?: unknown;
  limit?: number;
}) {
  const limit = normalizeLimit(input.limit);
  const urls = uniqueUrls([
    ...collectImageUrls(input.directorAnalysis?.scrapecreators_payload),
    ...collectImageUrls(input.directorAnalysis?.source_snapshot),
    ...collectImageUrls(input.sourceSnapshot),
  ]);
  return urls.slice(0, limit);
}

function collectImageUrls(value: unknown, depth = 0): string[] {
  if (depth > 5 || !value) return [];
  if (typeof value === "string") return isHttpUrl(value) ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap((item) => collectImageUrls(item, depth + 1));
  if (typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  const urls: string[] = [];
  for (const [key, item] of Object.entries(record)) {
    if (IMAGE_URL_ARRAY_KEYS.has(key)) {
      urls.push(...collectImageUrls(item, depth + 1));
      continue;
    }
    if (IMAGE_URL_KEYS.has(key) && typeof item === "string" && isHttpUrl(item)) {
      urls.push(item.trim());
      continue;
    }
    if (isLikelyNestedMediaKey(key)) urls.push(...collectImageUrls(item, depth + 1));
  }
  return urls;
}

function uniqueUrls(values: readonly string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function isHttpUrl(value: string) {
  return /^https?:\/\//iu.test(value.trim());
}

function normalizeLimit(value: number | undefined) {
  return Number.isInteger(value) && value && value > 0 ? value : 3;
}

function isLikelyNestedMediaKey(key: string) {
  return /media|image|thumbnail|preview|scrape|source|reference/iu.test(key);
}
