export function resolveProductReferenceImageUrls(snapshot: unknown) {
  const imageRefs = getProductImageRefs(snapshot);
  const orderedRefs = [
    ...imageRefs.filter((ref) => Boolean(ref.is_primary)),
    ...imageRefs.filter((ref) => !Boolean(ref.is_primary)),
  ];

  return uniqueStrings(
    orderedRefs
      .map((ref) => resolvePublicReferenceUrl(cleanText(ref.url)))
      .filter(Boolean)
  );
}

export function resolveProductIdentityReferenceImageUrls(snapshot: unknown) {
  const imageRefs = getProductImageRefs(snapshot);
  const identityRefs = imageRefs.filter(
    (ref) => ref.role === "product_primary" || Boolean(ref.is_primary)
  );
  const selected = identityRefs.length ? identityRefs : imageRefs.slice(0, 1);
  return uniqueStrings(
    selected
      .map((ref) => resolvePublicReferenceUrl(cleanText(ref.url)))
      .filter(Boolean)
  );
}

function getProductImageRefs(snapshot: unknown) {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.product_refs)) return [];
  return snapshot.product_refs.filter((ref): ref is Record<string, unknown> => (
    isRecord(ref) && ref.kind === "image" && ref.status !== "failed" && Boolean(cleanText(ref.url))
  ));
}

function resolvePublicReferenceUrl(url: string) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (!url.startsWith("/")) return url;
  const appUrl = cleanText(process.env.NEXT_PUBLIC_APP_URL) ||
    cleanText(process.env.WEBAPP_BASE_URL) ||
    cleanText(process.env.PUBLIC_APP_URL);
  if (!appUrl) return url;
  return `${appUrl.replace(/\/+$/u, "")}${url}`;
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
