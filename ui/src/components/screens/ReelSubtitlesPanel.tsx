"use client";

import { useState } from "react";
import { Captions, ExternalLink, Loader2, Settings, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OmniReel } from "@/lib/omni/types";

export function ReelSubtitlesPanel({
  reel,
  onReelUpdate,
}: {
  reel: OmniReel;
  onReelUpdate: (reel: OmniReel) => void;
}) {
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isBusy = isRendering || reel.subtitles_status === "transcribing" || reel.subtitles_status === "rendering";
  const statusLabel = getSubtitleStatusLabel(isRendering ? "rendering" : reel.subtitles_status);
  const wordsCount = getWordCount(reel);

  const renderSubtitles = async () => {
    setIsRendering(true);
    setError(null);
    try {
      const response = await fetch(`/api/omni/reels/${reel.id}/subtitles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Не удалось собрать субтитры");
      }
      onReelUpdate(payload as OmniReel);
    } catch (renderError) {
      setError(renderError instanceof Error ? renderError.message : "Не удалось собрать субтитры");
    } finally {
      setIsRendering(false);
    }
  };

  return (
    <section className="mt-3 rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            <Captions className="h-4 w-4" />
            Субтитры
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Deepgram тайминги · ASS/libass burned-in · {statusLabel}
          </p>
          <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
            <Settings className="h-3.5 w-3.5" />
            Стиль берётся из настроек проекта
          </p>
        </div>
        <Button type="button" size="sm" onClick={renderSubtitles} disabled={!reel.final_video_url || isBusy}>
          {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {isBusy ? "Собираю..." : "Пересобрать"}
        </Button>
      </div>

      {(error || reel.subtitles_error) ? (
        <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error || reel.subtitles_error}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {wordsCount ? <span className="rounded-md bg-muted px-2 py-1">{wordsCount} слов по Deepgram</span> : null}
        {reel.subtitled_video_url ? (
          <a
            href={reel.subtitled_video_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-primary hover:bg-muted"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Открыть версию с субтитрами
          </a>
        ) : null}
      </div>
    </section>
  );
}

function getSubtitleStatusLabel(status: OmniReel["subtitles_status"]) {
  if (status === "transcribing") return "транскрибация";
  if (status === "rendering") return "рендер";
  if (status === "completed") return "готово";
  if (status === "failed") return "ошибка";
  return "не собирались";
}

function getWordCount(reel: OmniReel) {
  const count = reel.subtitles_transcript?.word_count;
  return typeof count === "number" && count > 0 ? count : null;
}
