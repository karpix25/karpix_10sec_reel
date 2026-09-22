const MAX_INLINE_VIDEO_BYTES = 70 * 1024 * 1024;

export async function loadOpenRouterVideoDataUrl(videoUrl: string): Promise<string> {
  const response = await fetch(videoUrl, {
    redirect: "follow",
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new Error(`Reference video download failed: HTTP ${response.status}`);
  }

  const contentType = (response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
  if (!contentType.startsWith("video/")) {
    throw new Error(`Reference video URL returned ${contentType || "an unknown content type"}`);
  }

  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_INLINE_VIDEO_BYTES) {
    throw new Error(`Reference video is too large for inline OpenRouter input: ${declaredLength} bytes`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error("Reference video download returned an empty file");
  if (bytes.length > MAX_INLINE_VIDEO_BYTES) {
    throw new Error(`Reference video is too large for inline OpenRouter input: ${bytes.length} bytes`);
  }

  return `data:${contentType};base64,${bytes.toString("base64")}`;
}
