"use client";

import { Clock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AudioTrack } from "@/lib/audio-library/types";

function formatDuration(seconds: number | null) {
  if (!seconds) return "длительность n/a";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function TrackList({
  tracks,
  isLoading,
  isDeleting,
  onDelete,
}: {
  tracks: AudioTrack[];
  isLoading: boolean;
  isDeleting: boolean;
  onDelete: (trackId: number) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">Треки в папке</h2>
        <span className="text-xs text-muted-foreground">{tracks.length} файлов</span>
      </div>

      <div className="mt-4 space-y-3">
        {tracks.map((track) => (
          <div key={track.id} className="rounded-lg border border-border bg-muted/20 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{track.title}</p>
                <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDuration(track.duration_seconds)} · использован {track.play_count} раз
                </p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => onDelete(track.id)}
                disabled={isDeleting}
                title="Удалить из библиотеки"
                aria-label="Удалить из библиотеки"
                className="h-9 w-9 shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <audio src={track.file_url} controls className="mt-3 w-full" />
          </div>
        ))}

        {!tracks.length && !isLoading ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
            <p className="text-sm font-medium text-foreground">В этой папке пока нет аудио</p>
            <p className="mt-1 text-sm text-muted-foreground">Загрузи хотя бы один трек, чтобы ролики этого настроения получали музыку.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
