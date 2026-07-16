import { ExternalLink } from "lucide-react";
import type { OmniGeneratedScript } from "@/lib/omni/types";

export function OriginalReferenceLink({ script }: { script: OmniGeneratedScript }) {
  const originalReelUrl = getOriginalReelUrl(script);
  if (!originalReelUrl) return null;

  return (
    <a
      href={originalReelUrl}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-border px-3 text-xs font-semibold text-primary hover:bg-muted"
      title="Открыть оригинал в Instagram"
    >
      <ExternalLink className="h-4 w-4" />
      Оригинал
    </a>
  );
}

function getOriginalReelUrl(script: OmniGeneratedScript) {
  const snapshot = readRecord(script.source_snapshot);
  const value = snapshot?.reels_url;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
