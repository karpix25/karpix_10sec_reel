import { NextResponse } from "next/server";
import { archiveAudioTrack } from "@/lib/server/audio-library/tracks";
import { parsePositiveInt, requireOmniUser } from "@/lib/server/omni/http";

export async function DELETE(request: Request, { params }: { params: Promise<{ trackId: string }> }) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  const { trackId: rawTrackId } = await params;
  const trackId = parsePositiveInt(rawTrackId);
  if (!trackId) {
    return NextResponse.json({ error: "trackId is required" }, { status: 400 });
  }

  const track = await archiveAudioTrack(trackId);
  if (!track) {
    return NextResponse.json({ error: "Audio track not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
