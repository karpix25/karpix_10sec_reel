import { NextResponse } from "next/server";
import { validateApiRequest } from "@/lib/server/telegram-auth";

export async function requireOmniUser(request: Request) {
  const auth = await validateApiRequest(request);
  if (auth.errorResponse) {
    return { user: null, errorResponse: auth.errorResponse };
  }

  return { user: auth.user, errorResponse: null };
}

export function parsePositiveInt(value: unknown, fallback?: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback ?? null;
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
