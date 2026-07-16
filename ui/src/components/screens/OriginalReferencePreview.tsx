import { ExternalLink, Film } from "lucide-react";
import type { OmniGeneratedScript } from "@/lib/omni/types";

type OriginalReference = {
  sourceId: number | null;
  title: string | null;
  legacyClientName: string | null;
  directorVideoUrl: string | null;
  originalReelUrl: string | null;
};

export function OriginalReferencePreview({ script }: { script: OmniGeneratedScript }) {
  const reference = getOriginalReference(script);
  if (!reference.directorVideoUrl && !reference.originalReelUrl) return null;

  return (
    <section className="rounded-lg border border-border bg-card p-3">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            <Film className="h-4 w-4" />
            Оригинальный reference
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Source #{reference.sourceId || "n/a"}
            {reference.legacyClientName ? ` · ${reference.legacyClientName}` : ""}
          </p>
          {reference.title ? <p className="mt-1 line-clamp-2 text-sm font-medium text-foreground">{reference.title}</p> : null}
        </div>
        {reference.originalReelUrl ? (
          <a
            href={reference.originalReelUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-xs font-semibold text-primary hover:bg-muted"
          >
            <ExternalLink className="h-4 w-4" />
            Открыть оригинал
          </a>
        ) : null}
      </div>

      {reference.directorVideoUrl ? (
        <div className="overflow-hidden rounded-lg border border-border bg-black">
          <video
            src={reference.directorVideoUrl}
            controls
            playsInline
            preload="metadata"
            className="aspect-[9/16] max-h-[28rem] w-full object-contain"
          />
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border bg-background p-3 text-xs leading-5 text-muted-foreground">
          MP4 reference ещё не сохранён, но ссылка на оригинальный Reel доступна выше.
        </p>
      )}
    </section>
  );
}

function getOriginalReference(script: OmniGeneratedScript): OriginalReference {
  const snapshot = readRecord(script.source_snapshot);
  return {
    sourceId: script.source_legacy_scenario_id,
    title: readString(snapshot?.title),
    legacyClientName: readString(snapshot?.legacy_client_name),
    directorVideoUrl: readString(snapshot?.director_video_url),
    originalReelUrl: readString(snapshot?.reels_url),
  };
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
