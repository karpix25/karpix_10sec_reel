import axios from "axios";

export async function postOmniApi<T>(url: string, payload: unknown): Promise<T> {
  try {
    return (await axios.post(url, payload)).data as T;
  } catch (error) {
    throw normalizeOmniApiError(error);
  }
}

export function normalizeOmniApiError(error: unknown) {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data;
    const message = readErrorMessage(payload);
    if (message) return new Error(message);
  }
  return error instanceof Error ? error : new Error("Request failed");
}

function readErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  const record = payload as Record<string, unknown>;
  if (typeof record.error === "string" && record.error.trim()) return record.error.trim();
  if (typeof record.message === "string" && record.message.trim()) return record.message.trim();
  return "";
}
