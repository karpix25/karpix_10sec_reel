"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Music, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AudioMood, AudioMoodOption } from "@/lib/audio-library/moods";
import type { AudioTrack } from "@/lib/audio-library/types";
import { MoodFolderGrid } from "./MoodFolderGrid";
import { TrackList } from "./TrackList";

type AudioLibraryResponse = {
  moods: AudioMoodOption[];
  tracks: AudioTrack[];
};

export function AudioLibraryScreen() {
  const queryClient = useQueryClient();
  const [selectedMood, setSelectedMood] = useState<AudioMood>("energetic");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const libraryQuery = useQuery<AudioLibraryResponse>({
    queryKey: ["audio-library"],
    queryFn: async () => (await axios.get("/api/audio-library")).data,
    staleTime: 30_000,
  });

  const moods = useMemo(() => libraryQuery.data?.moods || [], [libraryQuery.data?.moods]);
  const tracks = useMemo(() => libraryQuery.data?.tracks || [], [libraryQuery.data?.tracks]);
  const selectedMoodMeta = moods.find((mood) => mood.id === selectedMood);
  const selectedTracks = useMemo(
    () => tracks.filter((track) => track.mood === selectedMood),
    [tracks, selectedMood]
  );

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Выберите аудиофайл");
      const formData = new FormData();
      formData.set("mood", selectedMood);
      formData.set("title", title.trim());
      formData.set("file", file);
      await axios.post("/api/audio-library", formData);
    },
    onSuccess: () => {
      setTitle("");
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ["audio-library"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (trackId: number) => {
      await axios.delete(`/api/audio-library/${trackId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["audio-library"] });
    },
  });

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <div className="flex flex-col gap-3 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-md border border-border bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <Music className="h-3.5 w-3.5 text-primary" />
            Глобальная библиотека
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground">Аудио по настроению</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Финальный Omni reel берет музыку из папки настроения сценария, подрезает или зацикливает трек под длину ролика и сохраняет результат как финальное видео.
          </p>
        </div>
      </div>

      <MoodFolderGrid
        moods={moods}
        tracks={tracks}
        selectedMood={selectedMood}
        onSelectMood={setSelectedMood}
        isLoading={libraryQuery.isLoading}
      />

      <section className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
        <div className="rounded-lg border border-border bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">{selectedMoodMeta?.label || "Папка"}</h2>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">{selectedMoodMeta?.description}</p>
            </div>
            <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
              {selectedTracks.length} треков
            </span>
          </div>

          <div className="mt-4 space-y-3">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Название трека"
              className="h-11"
            />
            <Input
              type="file"
              accept="audio/*"
              onChange={(event) => setFile(event.currentTarget.files?.[0] || null)}
              className="h-11 file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-primary-foreground"
            />
            {uploadMutation.error ? (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {uploadMutation.error instanceof Error ? uploadMutation.error.message : "Не удалось загрузить аудио"}
              </p>
            ) : null}
            <Button
              onClick={() => uploadMutation.mutate()}
              disabled={!file || uploadMutation.isPending}
              className="min-h-11 w-full"
            >
              <Upload className="h-4 w-4" />
              {uploadMutation.isPending ? "Загружаю..." : "Загрузить в папку"}
            </Button>
          </div>
        </div>

        <TrackList
          tracks={selectedTracks}
          isLoading={libraryQuery.isLoading}
          isDeleting={deleteMutation.isPending}
          onDelete={(trackId) => deleteMutation.mutate(trackId)}
        />
      </section>
    </div>
  );
}
