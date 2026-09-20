import { NextResponse } from "next/server";
import { jsonError, parsePositiveInt, requireOmniUser } from "@/lib/server/omni/http";
import { backfillReferenceMaterials } from "@/lib/server/omni/omni-reference-materials";

export async function POST(request: Request) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json().catch(() => ({}));
    const limit = Math.min(parsePositiveInt(body.limit) || 200, 1000);
    return NextResponse.json(await backfillReferenceMaterials(limit));
  } catch (error) {
    console.error("Omni reference materials backfill error:", error);
    return jsonError("Internal Server Error", 500);
  }
}
