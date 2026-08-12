import type { OmniAutomationJobSummary, OmniReel } from "@/lib/omni/types";
import type { PendingVideoStage } from "./GenerationPendingCards";

export type VideoFilter = "all" | "none" | "active" | "completed" | "failed";

export function VideoPreparationError() {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-sm text-foreground">
      Не удалось подготовить раскадровку. Видео в KIE.ai не отправлялось.
    </div>
  );
}

export function getAutomationVideoStageLabel(job: OmniAutomationJobSummary | null) {
  if (!job) return "Видео ещё не создавалось";
  if (job.status === "failed") return "Ошибка подготовки раскадровки";
  if (isStoryboardJsonRecovery(job)) return "Исправляю раскадровку";
  if (job.current_stage === "submit") return "Отправляю сегменты в KIE.ai";
  if (job.current_stage === "sync") return "Собираю видео";
  return "Проверяю раскадровки";
}

export function getPendingVideoStage(job: OmniAutomationJobSummary | null): PendingVideoStage {
  if (job?.current_stage === "submit") return "submit";
  if (job?.current_stage === "sync") return "sync";
  return "storyboard";
}

export function isStoryboardJsonRecovery(job: OmniAutomationJobSummary | null) {
  return Boolean(job?.last_error?.includes("Storyboard vision validator returned invalid JSON"));
}

export function EmptyVideoPanel() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
      Видео ещё не создавалось. Нажмите иконку с плёнкой в карточке.
    </div>
  );
}

export function matchesVideoFilter(reel: OmniReel | null, automationJob: OmniAutomationJobSummary | null, filter: VideoFilter) {
  if (filter === "all") return true;
  if (filter === "none") return !reel && !automationJob;
  if (!reel) {
    if (filter === "failed") return automationJob?.status === "failed";
    return filter === "active" && (automationJob?.status === "queued" || automationJob?.status === "processing");
  }
  if (filter === "completed") return reel.status === "completed";
  if (filter === "failed") return reel.status === "failed";
  return ["queued", "generating", "stitching"].includes(reel.status);
}
