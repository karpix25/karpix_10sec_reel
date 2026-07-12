"use client";

import type { OmniReel, OmniReelSegment } from "@/lib/omni/types";

export function VideoProgressSteps({ reel, segments }: { reel: OmniReel; segments: OmniReelSegment[] }) {
  const submittedCount = segments.filter((segment) => segment.kie_task_id).length;
  const completedCount = segments.filter((segment) => segment.status === "completed").length;
  const allCompleted = segments.length > 0 && completedCount === segments.length;
  const finalReady = reel.status === "completed" && Boolean(reel.final_video_url);

  return (
    <div className="grid gap-2 rounded-lg bg-muted/30 p-3">
      <VideoStep done label="План сегментов создан" />
      <VideoStep
        done={submittedCount === segments.length && segments.length > 0}
        active={submittedCount > 0 && submittedCount < segments.length}
        label={`Отправка в Omni: ${submittedCount}/${segments.length}`}
      />
      <VideoStep
        done={allCompleted}
        active={submittedCount > 0 && !allCompleted}
        label={`Готовые сегменты: ${completedCount}/${segments.length}`}
      />
      <VideoStep done={finalReady} active={allCompleted && !finalReady} label="Склейка, S3 и Яндекс" />
    </div>
  );
}

export function getVideoStageLabel(reel: OmniReel, segments: OmniReelSegment[]) {
  if (reel.status === "completed" && reel.final_video_url) return "Готово: финальное видео ниже";
  if (reel.status === "failed") return "Ошибка создания видео";
  if (reel.status === "stitching" || reel.stitch_status === "stitching") return "Склеиваю финальное видео";

  const completedCount = segments.filter((segment) => segment.status === "completed").length;
  const submittedCount = segments.filter((segment) => segment.kie_task_id).length;
  if (segments.length && completedCount === segments.length) return "Сегменты готовы, сохраняю и склеиваю";
  if (segments.length && submittedCount > 0) return `Omni генерирует сегменты: ${completedCount}/${segments.length} готово`;
  if (segments.length) return "План сегментов создан, готовлю отправку в Omni";
  return "Готовлю video job";
}

function VideoStep({ label, done, active }: { label: string; done?: boolean; active?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {done ? (
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
      ) : active ? (
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary" />
      ) : (
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
      )}
      <span className={done || active ? "font-medium text-foreground" : ""}>{label}</span>
    </div>
  );
}
