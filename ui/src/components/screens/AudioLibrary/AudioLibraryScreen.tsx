"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Music, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AudioMood, AudioMoodOption } from "@/lib/audio-library/moods";
import type { AudioTrack } from "@/lib/audio-library/types";
import { AudioUploadDialog } from "./AudioUploadDialog";
import { MoodFolderGrid } from "./MoodFolderGrid";
import { TrackList } from "./TrackList";

type AudioLibraryResponse = {
  moods: AudioMoodOption[];
  tracks: AudioTrack[];
};

export function AudioLibraryScreen() {
  const queryClient = useQueryClient();
  const [selectedMood, setSelectedMood] = useState<AudioMood>("energetic");
  const [isUploadOpen, setIsUploadOpen] = useState(false);

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
    mutationFn: async ({ files, title }: { files: File[]; title: string }) => {
      if (!files.length) throw new Error("Выберите аудиофайл");
      const formData = new FormData();
      formData.set("mood", selectedMood);
      formData.set("title", title);
      files.forEach((file) => formData.append("files", file));
      await axios.post("/api/audio-library", formData);
    },
    onSuccess: () => {
      setIsUploadOpen(false);
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
        <Button type="button" onClick={() => setIsUploadOpen(true)} className="min-h-11 shrink-0">
          <Upload className="h-4 w-4" />
          Загрузить аудио
        </Button>
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
          <Button type="button" variant="outline" onClick={() => setIsUploadOpen(true)} className="mt-4 min-h-11 w-full">
            <Upload className="h-4 w-4" />
            Добавить треки в эту папку
          </Button>
        </div>

        <TrackList
          tracks={selectedTracks}
          isLoading={libraryQuery.isLoading}
          isDeleting={deleteMutation.isPending}
          onDelete={(trackId) => deleteMutation.mutate(trackId)}
        />
      </section>

      <AudioUploadDialog
        open={isUploadOpen}
        onOpenChange={setIsUploadOpen}
        moods={moods}
        selectedMood={selectedMood}
        onMoodChange={setSelectedMood}
        isUploading={uploadMutation.isPending}
        error={uploadMutation.error}
        onUpload={(input) => uploadMutation.mutate(input)}
      />
    </div>
  );
}
