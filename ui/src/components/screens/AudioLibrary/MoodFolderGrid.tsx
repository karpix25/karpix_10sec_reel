"use client";

import { Folder, LoaderCircle } from "lucide-react";
import type { AudioMood, AudioMoodOption } from "@/lib/audio-library/moods";
import type { AudioTrack } from "@/lib/audio-library/types";

export function MoodFolderGrid({
  moods,
  tracks,
  selectedMood,
  onSelectMood,
  isLoading,
}: {
  moods: AudioMoodOption[];
  tracks: AudioTrack[];
  selectedMood: AudioMood;
  onSelectMood: (mood: AudioMood) => void;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex min-h-32 items-center justify-center rounded-lg border border-border bg-white">
        <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {moods.map((mood) => {
        const count = tracks.filter((track) => track.mood === mood.id).length;
        const selected = mood.id === selectedMood;
        return (
          <button
            key={mood.id}
            type="button"
            onClick={() => onSelectMood(mood.id)}
            className={`min-h-32 rounded-lg border bg-white p-4 text-left shadow-sm transition ${
              selected ? "border-primary ring-2 ring-primary/15" : "border-border hover:border-primary/50"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Folder className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{mood.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{count} аудио</p>
                </div>
              </div>
            </div>
            <p className="mt-3 line-clamp-2 text-sm leading-5 text-muted-foreground">{mood.description}</p>
          </button>
        );
      })}
    </div>
  );
}
