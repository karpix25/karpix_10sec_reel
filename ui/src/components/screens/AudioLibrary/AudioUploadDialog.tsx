"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { AudioMood, AudioMoodOption } from "@/lib/audio-library/moods";

type AudioUploadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moods: AudioMoodOption[];
  selectedMood: AudioMood;
  onMoodChange: (mood: AudioMood) => void;
  isUploading: boolean;
  error: unknown;
  onUpload: (input: { files: File[]; title: string }) => void;
};

export function AudioUploadDialog({
  open,
  onOpenChange,
  moods,
  selectedMood,
  onMoodChange,
  isUploading,
  error,
  onUpload,
}: AudioUploadDialogProps) {
  const [title, setTitle] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const selectedMoodMeta = moods.find((mood) => mood.id === selectedMood);
  const errorMessage = error instanceof Error ? error.message : error ? "Не удалось загрузить аудио" : null;

  const reset = () => {
    setTitle("");
    setFiles([]);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !isUploading) reset();
    onOpenChange(nextOpen);
  };

  const handleUpload = () => {
    onUpload({ files, title: title.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Загрузить аудио</DialogTitle>
          <DialogDescription>
            Выбери папку настроения и добавь один или несколько треков в глобальную библиотеку.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="block space-y-2">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Папка настроения</span>
            <select
              value={selectedMood}
              onChange={(event) => onMoodChange(event.target.value as AudioMood)}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring"
            >
              {moods.map((mood) => (
                <option key={mood.id} value={mood.id}>
                  {mood.label}
                </option>
              ))}
            </select>
            {selectedMoodMeta ? (
              <span className="block text-xs leading-5 text-muted-foreground">{selectedMoodMeta.description}</span>
            ) : null}
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Название</span>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Опционально для одного файла"
              className="h-11"
            />
            <span className="block text-xs leading-5 text-muted-foreground">
              Если файлов несколько, названия будут взяты из имен файлов.
            </span>
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Файлы</span>
            <Input
              type="file"
              accept="audio/*"
              multiple
              onChange={(event) => setFiles(Array.from(event.currentTarget.files || []))}
              className="h-11 file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-primary-foreground"
            />
          </label>

          {files.length ? (
            <div className="max-h-32 overflow-y-auto rounded-md border border-border bg-muted/30 p-3">
              {files.map((file) => (
                <div key={`${file.name}-${file.lastModified}`} className="truncate text-sm font-medium text-foreground">
                  {file.name}
                </div>
              ))}
            </div>
          ) : null}

          {errorMessage ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorMessage}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isUploading}>
            Отмена
          </Button>
          <Button type="button" onClick={handleUpload} disabled={!files.length || isUploading}>
            <Upload className="h-4 w-4" />
            {isUploading ? "Загружаю..." : `Загрузить ${files.length || ""}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
