export function normalizeLegacyReelsUrl(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const path = url.pathname.replace(/^\/reels\//u, "/reel/").replace(/\/+$/u, "");
    return `${url.hostname.toLowerCase()}${path}`;
  } catch {
    return raw.split(/[?#]/u, 1)[0]?.replace(/\/+$/u, "") || null;
  }
}
