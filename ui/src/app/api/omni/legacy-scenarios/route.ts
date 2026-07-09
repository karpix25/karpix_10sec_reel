import { NextResponse } from "next/server";
import { clampInt, jsonError, parsePositiveInt, requireOmniUser } from "@/lib/server/omni/http";
import { listLegacyScenarios } from "@/lib/server/omni/legacy-scenarios";

export async function GET(request: Request) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  const { searchParams } = new URL(request.url);
  const limit = clampInt(searchParams.get("limit"), 1, 50, 20);
  const offset = clampInt(searchParams.get("offset"), 0, 10000, 0);
  const clientId = parsePositiveInt(searchParams.get("clientId"));
  const query = searchParams.get("q")?.trim() || null;

  try {
    return NextResponse.json(await listLegacyScenarios({ query, clientId, limit, offset }));
  } catch (error) {
    console.error("Omni legacy scenarios error:", error);
    return jsonError(error instanceof Error ? error.message : "Internal Server Error", 500);
  }
}
