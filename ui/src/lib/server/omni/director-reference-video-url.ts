export function extractDirectorReferenceVideoUrl(snapshot: unknown) {
  const candidates = collectUrls(snapshot, /(?:director|reference|source|stored|resolved|video|reels).*url/iu)
    .filter((url) => !looksLikeImageUrl(url))
    .filter((url) => !looksLikeSocialPageUrl(url));
  return candidates[0] || null;
}

function collectUrls(value: unknown, keyPattern: RegExp, depth = 0, allowString = false): string[] {
  if (depth > 5 || value == null) return [];
  if (typeof value === "string") return allowString && isHttpUrl(value) ? [value.trim()] : [];
  if (Array.isArray(value)) return uniqueUrls(value.flatMap((item) => collectUrls(item, keyPattern, depth + 1, allowString)));
  if (typeof value !== "object") return [];

  const urls: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const matches = keyPattern.test(key);
    if (typeof child === "string" && matches && isHttpUrl(child)) urls.push(child.trim());
    urls.push(...collectUrls(child, keyPattern, depth + 1, matches));
  }
  return uniqueUrls(urls);
}

function isHttpUrl(value: string) {
  return /^https?:\/\//iu.test(value.trim());
}

function looksLikeImageUrl(value: string) {
  return /\.(?:jpe?g|png|webp)(?:[?#].*)?$/iu.test(value);
}

function looksLikeSocialPageUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./iu, "").toLowerCase();
    const path = url.pathname.toLowerCase();
    return (
      (host === "instagram.com" && /^\/(?:reel|reels|p)\//iu.test(path)) ||
      (host === "tiktok.com" && path.includes("/video/")) ||
      (host === "vm.tiktok.com") ||
      (host === "youtube.com" && path.startsWith("/shorts/")) ||
      (host === "youtu.be")
    );
  } catch {
    return false;
  }
}

function uniqueUrls(values: readonly string[]) {
  return [...new Set(values.map((url) => url.trim()).filter(Boolean))];
}
