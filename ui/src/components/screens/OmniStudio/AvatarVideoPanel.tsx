"use client";

import { Bot, ExternalLink, Film, ImageUp, Play, RefreshCw, Video, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OmniClientAvatar, OmniProduct, OmniProject, OmniReel, OmniReelSegment } from "@/lib/omni/types";
import { OmniSegmentPromptDetails } from "./OmniSegmentPromptDetails";
import { EmptyState, QueryState, ReadinessItem, SegmentDots, StatusBadge, WorkbenchPanel } from "./ui";

export type AvatarDraft = {
  prompt: string;
  referenceUrl: string;
};

export function AvatarVideoPanel({
  activeProject,
  activeProduct,
  selectedScenarioId,
  avatars,
  latestAvatar,
  avatarDraft,
  reels,
  segments,
  isAvatarsLoading,
  isReelsLoading,
  isCreatingAvatar,
  isUploadingAvatarReference,
  isCreatingReel,
  isRunningReel,
  isSyncingReel,
  onAvatarDraftChange,
  onUploadAvatarReference,
  onCreateAvatar,
  onCreateReel,
  onRunReel,
  onSyncReel,
}: {
  activeProject: OmniProject | null;
  activeProduct: OmniProduct | null;
  selectedScenarioId: number | null;
  avatars: OmniClientAvatar[];
  latestAvatar: OmniClientAvatar | null;
  avatarDraft: AvatarDraft;
  reels: OmniReel[];
  segments: OmniReelSegment[];
  isAvatarsLoading: boolean;
  isReelsLoading: boolean;
  isCreatingAvatar: boolean;
  isUploadingAvatarReference: boolean;
  isCreatingReel: boolean;
  isRunningReel: boolean;
  isSyncingReel: boolean;
  onAvatarDraftChange: (draft: AvatarDraft) => void;
  onUploadAvatarReference: (file: File | null) => void;
  onCreateAvatar: () => void;
  onCreateReel: () => void;
  onRunReel: (reelId: number) => void;
  onSyncReel: (reelId: number) => void;
}) {
  const canCreateReel = Boolean(activeProject && activeProduct && latestAvatar && selectedScenarioId);
  const referenceUrl = avatarDraft.referenceUrl.trim() || latestAvatar?.reference_url || "";
  const referenceLooksLikeVideo = /\.(mp4|webm|mov)(\?|$)/i.test(referenceUrl);

  return (
    <div className="space-y-4">
      <WorkbenchPanel
        title="Аватар бренда"
        description="Один брендовый avatar reference может использоваться всеми продуктами бренда."
        action={<Bot className="h-4 w-4 text-muted-foreground" />}
      >
        <QueryState
          isLoading={isAvatarsLoading}
          loadingText="Загружаю аватары"
          errorText="Не удалось загрузить аватары"
        />
        <div className="space-y-3">
          {latestAvatar ? (
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Avatar draft #{latestAvatar.id}</p>
                  <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">{latestAvatar.prompt}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {avatars.length} draft(s) saved · provider: {latestAvatar.provider}
                  </p>
                </div>
                <StatusBadge status={latestAvatar.status} />
              </div>
            </div>
          ) : (
            <EmptyState
              title="Аватар еще не сохранен"
              description="Опиши, каким должен быть брендовый аватар, или загрузи reference. Этот draft попадёт в Omni prompt contract."
            />
          )}

          <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Prompt для создания
            <textarea
              value={avatarDraft.prompt}
              onChange={(event) => onAvatarDraftChange({ ...avatarDraft, prompt: event.target.value })}
              placeholder="Внешность, возраст, стиль речи, одежда, кадр, поведение"
              disabled={!activeProject}
              className="min-h-28 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm font-normal normal-case tracking-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <ImageUp className="h-3.5 w-3.5 text-primary" />
              Загрузить reference
            </span>
            <Input
              type="file"
              accept="image/*,video/mp4,video/webm,video/quicktime"
              onChange={(event) => {
                onUploadAvatarReference(event.currentTarget.files?.[0] || null);
                event.currentTarget.value = "";
              }}
              disabled={!activeProject || isUploadingAvatarReference}
              className="h-11 normal-case tracking-normal file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-primary-foreground"
            />
          </label>
          {isUploadingAvatarReference ? (
            <p className="text-xs leading-5 text-muted-foreground">Загружаю avatar reference...</p>
          ) : null}
          <Input
            value={avatarDraft.referenceUrl}
            onChange={(event) => onAvatarDraftChange({ ...avatarDraft, referenceUrl: event.target.value })}
            placeholder="Или вставь Reference URL аватара"
            disabled={!activeProject}
            className="h-11"
          />
          {referenceUrl ? (
            <div className="overflow-hidden rounded-lg border border-border bg-background">
              {referenceLooksLikeVideo ? (
                <video src={referenceUrl} controls className="aspect-video w-full bg-black object-contain" />
              ) : (
                <img src={referenceUrl} alt="Avatar reference" className="aspect-video w-full object-cover" />
              )}
            </div>
          ) : null}
          <Button
            size="lg"
            variant="outline"
            onClick={onCreateAvatar}
            disabled={!activeProject || !avatarDraft.prompt.trim() || isCreatingAvatar}
            className="min-h-11 w-full whitespace-nowrap"
          >
            <WandSparkles className="h-4 w-4" />
            Создать через GPT Image 2
          </Button>
        </div>
      </WorkbenchPanel>

      <WorkbenchPanel
        title="План видео"
        description="Сценарий превращается в production plan: сегменты по 4/6/8/10 секунд, снапшоты refs и prompt contract."
      >
        <div className="grid gap-2 rounded-lg bg-muted/30 p-3">
          <ReadinessItem done={Boolean(activeProject)} label="Карточка бренда выбрана" />
          <ReadinessItem done={Boolean(activeProduct)} label="Продукт выбран" />
          <ReadinessItem done={Boolean(latestAvatar)} label="Avatar draft сохранен" />
          <ReadinessItem done={Boolean(selectedScenarioId)} label="Сценарий выбран" />
        </div>
        <Button
          size="lg"
          onClick={onCreateReel}
          disabled={!canCreateReel || isCreatingReel}
          className="mt-3 min-h-11 w-full whitespace-nowrap"
        >
          <Film className="h-4 w-4" />
          Создать видео
        </Button>
      </WorkbenchPanel>

      <WorkbenchPanel title="Reel jobs" description="Сегменты отправляются в Omni, затем готовые mp4 склеиваются и сохраняются в S3 + Яндекс.">
        <QueryState isLoading={isReelsLoading} loadingText="Загружаю draft reels" errorText="Не удалось загрузить reels" />
        <div className="space-y-2">
          {reels.map((reel) => (
            <div key={reel.id} className="rounded-lg border border-border bg-background p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Reel #{reel.id}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {reel.target_duration_seconds} сек / {reel.segment_count} сегмента / stitch: {reel.stitch_status}
                  </p>
                </div>
                <StatusBadge status={reel.status} />
              </div>
              {reel.final_video_url ? (
                <div className="mt-3 overflow-hidden rounded-lg border border-border bg-black">
                  <video src={reel.final_video_url} controls playsInline className="aspect-[9/16] max-h-[34rem] w-full object-contain" />
                </div>
              ) : null}
              {reel.final_video_url || reel.yandex_public_url || reel.yandex_disk_path ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {reel.final_video_url ? (
                    <a
                      href={reel.final_video_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-medium text-primary hover:bg-muted"
                    >
                      <Video className="h-3.5 w-3.5" />
                      S3 preview
                    </a>
                  ) : null}
                  {reel.yandex_public_url ? (
                    <a
                      href={reel.yandex_public_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-medium text-primary hover:bg-muted"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Yandex
                    </a>
                  ) : reel.yandex_disk_path ? (
                    <span className="truncate rounded-md bg-muted px-2 py-1">Yandex: {reel.yandex_disk_path}</span>
                  ) : null}
                </div>
              ) : null}
              {reel.yandex_status === "failed" && reel.yandex_error ? (
                <p className="mt-2 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">{reel.yandex_error}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => onRunReel(reel.id)}
                  disabled={isRunningReel || reel.status === "completed"}
                  title="Запустить сегменты"
                  aria-label="Запустить сегменты"
                  className="h-9 w-9"
                >
                  <Play className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => onSyncReel(reel.id)}
                  disabled={isSyncingReel}
                  title="Проверить статус и собрать"
                  aria-label="Проверить статус и собрать"
                  className="h-9 w-9"
                >
                  <RefreshCw className={`h-4 w-4 ${isSyncingReel ? "animate-spin" : ""}`} />
                </Button>
              </div>
              <div className="mt-3">
                <SegmentDots segments={segments.filter((segment) => segment.reel_id === reel.id)} />
              </div>
              <div className="mt-3 grid gap-2">
                {segments
                  .filter((segment) => segment.reel_id === reel.id)
                  .map((segment) => (
                    <div key={segment.id} className="rounded-lg border border-border bg-card p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                            Segment {segment.segment_index} · {segment.slot_role || "body"}
                          </p>
                          {segment.reference_url ? (
                            <p className="mt-1 truncate text-xs text-muted-foreground">{segment.reference_url}</p>
                          ) : null}
                        </div>
                        <StatusBadge status={segment.status} />
                      </div>
                      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-xs leading-5 text-foreground">
                        {segment.prompt || "Prompt пока не подготовлен."}
                      </pre>
                      <OmniSegmentPromptDetails
                        prompt={segment.prompt}
                        voiceoverText={segment.voiceover_text}
                        creativeStrategy={reel.creative_strategy}
                        creativePlan={segment.creative_plan}
                        validation={segment.prompt_validation}
                      />
                    </div>
                  ))}
              </div>
            </div>
          ))}
          {!reels.length && (
            <EmptyState
              title="Draft reels пока нет"
              description="Выбери продукт и сценарий, затем подготовь видео. Здесь появятся сегменты для Omni."
            />
          )}
        </div>
      </WorkbenchPanel>
    </div>
  );
}
