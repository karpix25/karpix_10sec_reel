import { NextResponse } from "next/server";
import { listLegacyLibraries } from "@/lib/server/omni/legacy-libraries";
import { jsonError, parsePositiveInt, requireOmniUser } from "@/lib/server/omni/http";

export async function GET(request: Request) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  const { searchParams } = new URL(request.url);
  const limit = parsePositiveInt(searchParams.get("limit")) || 30;
  const includeClientIds = (searchParams.get("includeClientIds") || "")
    .split(",")
    .map((value) => parsePositiveInt(value))
    .filter((value): value is number => Boolean(value));

  try {
    return NextResponse.json(
      await listLegacyLibraries({
        query: searchParams.get("q"),
        limit: Math.min(limit, 100),
        includeClientIds,
      })
    );
  } catch (error) {
    console.error("Omni legacy libraries list error:", error);
    return jsonError("Legacy DB is not configured or unavailable", 500);
  }
}
