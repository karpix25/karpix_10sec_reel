import { NextResponse } from "next/server";
import { jsonError, parsePositiveInt, requireOmniUser } from "@/lib/server/omni/http";
import { rebuildOmniReelSubtitles } from "@/lib/server/omni/omni-reel-subtitles";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ reelId: string }> }) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  const params = await context.params;
  const reelId = parsePositiveInt(params.reelId);
  if (!reelId) return jsonError("reelId is required");

  try {
    const body = await request.json().catch(() => ({}));
    const reel = await rebuildOmniReelSubtitles({
      reelId,
      forceTranscribe: Boolean(body.forceTranscribe),
    });
    return NextResponse.json(reel);
  } catch (error) {
    console.error("Omni reel subtitles error:", error);
    return jsonError(error instanceof Error ? error.message : "Internal Server Error", 500);
  }
}
