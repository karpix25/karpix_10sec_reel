import { NextResponse } from "next/server";
import { jsonError, parsePositiveInt, requireOmniUser } from "@/lib/server/omni/http";
import { syncOmniReel } from "@/lib/server/omni/omni-reel-runner";

export async function POST(request: Request, context: { params: Promise<{ reelId: string }> }) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  const params = await context.params;
  const reelId = parsePositiveInt(params.reelId);
  if (!reelId) return jsonError("reelId is required");

  try {
    const bundle = await syncOmniReel(reelId);
    return NextResponse.json(bundle);
  } catch (error) {
    console.error("Omni reel sync error:", error);
    return jsonError(error instanceof Error ? error.message : "Internal Server Error", 500);
  }
}
