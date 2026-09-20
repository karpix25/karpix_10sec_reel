import { timingSafeEqual } from "crypto";
import { jsonError } from "./http";

const INSECURE_DEFAULT_TOKEN = "change-me-in-production";

function tokensMatch(received: string, expected: string) {
  const a = Buffer.from(received, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || a.length === 0) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export function requireAutomationToken(request: Request) {
  const expected = (process.env.AUTOMATION_INTERNAL_TOKEN || "").trim();
  const received = (request.headers.get("x-automation-token") || "").trim();

  if (!expected || expected === INSECURE_DEFAULT_TOKEN) {
    return jsonError("Automation token is not configured", 503);
  }

  if (!tokensMatch(received, expected)) {
    return jsonError("Unauthorized", 401);
  }

  return null;
}
