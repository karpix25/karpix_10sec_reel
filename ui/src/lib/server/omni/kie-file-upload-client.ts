const DEFAULT_FILE_UPLOAD_BASE_URL = "https://kieai.redpandaai.co";

export type KieUploadedFile = {
  url: string;
  raw: Record<string, unknown>;
};

function getApiKey() {
  const key = process.env.KIE_API_KEY || process.env.KIE_AI_API_KEY || "";
  if (!key.trim()) throw new Error("KIE_API_KEY is not configured");
  return key.trim();
}

function getFileUploadBaseUrl() {
  return (process.env.KIE_FILE_UPLOAD_BASE_URL || DEFAULT_FILE_UPLOAD_BASE_URL).replace(/\/$/, "");
}

export async function uploadKieFileFromUrl(fileUrl: string): Promise<KieUploadedFile> {
  const cleanUrl = fileUrl.trim();
  if (!/^https?:\/\//i.test(cleanUrl)) throw new Error("KIE file upload requires a public HTTP URL");

  const response = await fetch(`${getFileUploadBaseUrl()}/api/file-url-upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fileUrl: cleanUrl,
      uploadPath: "omni/avatars",
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || !payload) {
    throw new Error(`KIE file upload failed: ${response.status} ${formatUploadError(payload)}`);
  }

  const data = isRecord(payload.data) ? payload.data : {};
  const uploadedUrl = pickString(data, ["downloadUrl", "fileUrl"]);
  if (!uploadedUrl) throw new Error(`KIE file upload did not return file URL: ${JSON.stringify(payload)}`);

  return { url: uploadedUrl, raw: payload };
}

function formatUploadError(payload: Record<string, unknown> | null) {
  if (!payload) return "empty response";
  return pickString(payload, ["msg", "message", "error"]) || JSON.stringify(payload);
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
