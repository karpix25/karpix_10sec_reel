import { jsonError } from "./http";

export function requireAutomationToken(request: Request) {
  const expected = (process.env.AUTOMATION_INTERNAL_TOKEN || "").trim();
  const received = (request.headers.get("x-automation-token") || "").trim();

  if (!expected || received !== expected) {
    return jsonError("Unauthorized", 401);
  }

  return null;
}
