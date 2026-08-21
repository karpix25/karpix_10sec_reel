import { NextResponse } from "next/server";
import { getReadableS3Url } from "@/lib/server/s3-storage";
import { getOmniReel } from "@/lib/server/omni/reels";
import { jsonError, parsePositiveInt, requireOmniUser } from "@/lib/server/omni/http";

export async function GET(request: Request, context: { params: Promise<{ reelId: string }> }) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  const reelId = parsePositiveInt((await context.params).reelId);
  if (!reelId) return jsonError("reelId is required");

  try {
    const reel = await getOmniReel(reelId);
    if (!reel) return jsonError("Reel not found", 404);
    const variant = new URL(request.url).searchParams.get("variant");
    const sourceUrl = variant === "subtitled"
      ? reel.subtitled_video_url || reel.final_s3_url || reel.final_video_url
      : reel.final_s3_url || reel.final_video_url;
    const playbackUrl = await getReadableS3Url(sourceUrl);
    if (!playbackUrl) return jsonError("Video is not ready", 404);
    return NextResponse.redirect(playbackUrl, {
      status: 307,
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (error) {
    console.error("Omni reel playback error:", error);
    return jsonError("Unable to open video", 502);
  }
}
