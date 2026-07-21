import { NextResponse } from "next/server";
import { AUDIO_MOOD_OPTIONS } from "@/lib/audio-library/moods";
import { listAudioTracks, uploadAudioTrack } from "@/lib/server/audio-library/tracks";
import { requireOmniUser } from "@/lib/server/omni/http";

export async function GET(request: Request) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  const tracks = await listAudioTracks();
  return NextResponse.json({ moods: AUDIO_MOOD_OPTIONS, tracks });
}

export async function POST(request: Request) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Аудиофайл обязателен" }, { status: 400 });
    }

    const track = await uploadAudioTrack({
      mood: formData.get("mood"),
      title: formData.get("title"),
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      buffer: Buffer.from(await file.arrayBuffer()),
    });
    return NextResponse.json({ track });
  } catch (error) {
    console.error("Audio library upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось загрузить аудио" },
      { status: 500 }
    );
  }
}
