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
    const files = formData
      .getAll("files")
      .filter((item): item is File => item instanceof File && item.size > 0);
    const legacyFile = formData.get("file");
    const uploadFiles = files.length
      ? files
      : legacyFile instanceof File && legacyFile.size > 0
        ? [legacyFile]
        : [];

    if (!uploadFiles.length) {
      return NextResponse.json({ error: "Аудиофайл обязателен" }, { status: 400 });
    }

    const rawTitle = String(formData.get("title") || "").trim();
    const tracks = [];
    for (const file of uploadFiles) {
      tracks.push(
        await uploadAudioTrack({
          mood: formData.get("mood"),
          title: uploadFiles.length === 1 ? rawTitle : "",
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          buffer: Buffer.from(await file.arrayBuffer()),
        })
      );
    }
    return NextResponse.json({ tracks, track: tracks[0] || null });
  } catch (error) {
    console.error("Audio library upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось загрузить аудио" },
      { status: 500 }
    );
  }
}
