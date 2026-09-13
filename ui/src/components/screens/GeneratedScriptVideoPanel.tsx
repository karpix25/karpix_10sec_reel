"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ExternalLink, Video } from "lucide-react";
import type {
  OmniAutomationJobSummary,
  OmniReel,
  OmniReelSegment,
  OmniStoryboardSetRepairState,
} from "@/lib/omni/types";
import type { OmniGenerationProvider } from "@/lib/omni/provider";
import { PendingVideoCard } from "./GenerationPendingCards";
import {
  EmptyVideoPanel,
  getPendingVideoStage,
  getStoryboardRepairStatus,
  isStoryboardJsonRecovery,
  VideoPreparationError,
} from "./GeneratedScriptVideoPreparationStatus";
import { SegmentDots, StatusBadge } from "./OmniStudio/ui";
import { ReelSubtitlesPanel } from "./ReelSubtitlesPanel";
import { getVideoStageLabel, VideoProgressSteps } from "./VideoProgressStatus";
import { getOmniReelPlaybackUrl } from "@/lib/omni/reel-playback";

export function GeneratedScriptVideoPanel({
  reel,
  segments,
  pendingVideo,
  automationJob,
  storyboardRepairState,
  omniGenerationProvider,
}: {
  reel: OmniReel | null;
  segments: OmniReelSegment[];
  pendingVideo: boolean;
  automationJob: OmniAutomationJobSummary | null;
  storyboardRepairState: OmniStoryboardSetRepairState | null | undefined;
  omniGenerationProvider: OmniGenerationProvider;
}) {
  const [currentReel, setCurrentReel] = useState(reel);
  const [deliveryPending, setDeliveryPending] = useState(false);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentReel(reel);
  }, [reel]);

  async function retryDelivery() {
    if (!currentReel || deliveryPending) return;
    setDeliveryPending(true);
    setDeliveryError(null);
    try {
      const response = await fetch(`/api/omni/reels/${currentReel.id}/yandex-delivery`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Не удалось повторить доставку.");
      setCurrentReel(result);
    } catch (error) { setDeliveryError(error instanceof Error ? error.message : "Не удалось повторить доставку."); }
    finally { setDeliveryPending(false); }
  }

  if (!currentReel) {
    if (automationJob?.status === "failed") return <VideoPreparationError errorMessage={automationJob.last_error} />;
    const stage = getPendingVideoStage(automationJob);
    return pendingVideo || automationJob ? (
      <PendingVideoCard
        provider={omniGenerationProvider}
        stage={stage}
        recovering={isStoryboardJsonRecovery(automationJob) || Boolean(storyboardRepairState)}
        storyboardStatus={getStoryboardRepairStatus(storyboardRepairState)}
      />
    ) : <EmptyVideoPanel />;
  }

  const displayVideoUrl = currentReel.final_video_url
    ? getOmniReelPlaybackUrl(currentReel.id, Boolean(currentReel.subtitled_video_url))
    : null;

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Видео</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Reel #{currentReel.id} · {currentReel.target_duration_seconds} сек · {currentReel.segment_count} сегмента
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">{getVideoStageLabel(currentReel, segments)}</p>
        </div>
        <StatusBadge status={currentReel.status} />
      </div>

      {displayVideoUrl ? (
        <div className="mt-3 overflow-hidden rounded-lg border border-border bg-black">
          <video key={displayVideoUrl} src={displayVideoUrl} controls playsInline className="aspect-[9/16] max-h-[34rem] w-full object-contain" />
        </div>
      ) : null}
      {currentReel.subtitled_video_url ? <p className="mt-2 text-xs text-muted-foreground">Показываю версию с burned-in субтитрами.</p> : null}

      {segments.length ? (
        <div className="mt-3 space-y-3">
          <SegmentDots segments={segments} />
          <VideoProgressSteps reel={currentReel} segments={segments} />
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {displayVideoUrl ? <ExternalIconLink href={displayVideoUrl} label="Открыть S3 preview"><Video className="h-4 w-4" /></ExternalIconLink> : null}
        {currentReel.yandex_public_url ? <ExternalIconLink href={currentReel.yandex_public_url} label="Открыть на Яндекс Диске"><ExternalLink className="h-4 w-4" /></ExternalIconLink> : null}
        {currentReel.yandex_disk_path ? <span className="min-w-0 truncate rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{currentReel.yandex_disk_path}</span> : null}
      </div>

      {currentReel.status === "completed" && currentReel.yandex_status === "failed" && currentReel.final_s3_url ? (
        <div className="mt-3 rounded-md border border-border p-3 text-sm">
          <p>Видео готово. Доставка на Яндекс Диск не завершена.</p>
          <p className="mt-1 text-xs text-muted-foreground" role="status">{deliveryError || currentReel.yandex_error}</p>
          <button type="button" disabled={deliveryPending} onClick={retryDelivery} className="mt-2 rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50">
            {deliveryPending ? "Доставляем готовое видео…" : "Повторить доставку на Яндекс Диск"}
          </button>
        </div>
      ) : null}

      {currentReel.final_video_url ? <ReelSubtitlesPanel reel={currentReel} onReelUpdate={setCurrentReel} /> : null}
    </div>
  );
}

function ExternalIconLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-primary hover:bg-muted" title={label} aria-label={label}>{children}</a>;
}
