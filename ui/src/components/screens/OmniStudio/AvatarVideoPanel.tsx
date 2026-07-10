"use client";

import { Bot, Film, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OmniClientAvatar, OmniProduct, OmniProject, OmniReel, OmniReelSegment } from "@/lib/omni/types";
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
  isCreatingReel,
  onAvatarDraftChange,
  onCreateAvatar,
  onCreateReel,
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
  isCreatingReel: boolean;
  onAvatarDraftChange: (draft: AvatarDraft) => void;
  onCreateAvatar: () => void;
  onCreateReel: () => void;
}) {
  const canCreateReel = Boolean(activeProject && activeProduct && latestAvatar && selectedScenarioId);

  return (
    <div className="space-y-4">
      <WorkbenchPanel
        title="Аватар клиента"
        description="Один клиентский avatar reference может использоваться всеми продуктами клиента."
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
                  <p className="mt-2 text-xs text-muted-foreground">{avatars.length} draft(s) saved for this client</p>
                </div>
                <StatusBadge status={latestAvatar.status} />
              </div>
            </div>
          ) : (
            <EmptyState
              title="Аватар еще не сохранен"
              description="Опиши, каким должен быть клиентский аватар. Далее подключим очередь генерации и approve flow через KIE Omni."
            />
          )}

          <textarea
            value={avatarDraft.prompt}
            onChange={(event) => onAvatarDraftChange({ ...avatarDraft, prompt: event.target.value })}
            placeholder="Промпт аватара: внешность, стиль речи, кадр, одежда, поведение"
            disabled={!activeProject}
            className="min-h-24 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
          <Input
            value={avatarDraft.referenceUrl}
            onChange={(event) => onAvatarDraftChange({ ...avatarDraft, referenceUrl: event.target.value })}
            placeholder="Reference URL аватара, если уже есть"
            disabled={!activeProject}
            className="h-11"
          />
          <Button
            size="lg"
            variant="outline"
            onClick={onCreateAvatar}
            disabled={!activeProject || !avatarDraft.prompt.trim() || isCreatingAvatar}
            className="min-h-11 w-full whitespace-nowrap"
          >
            <WandSparkles className="h-4 w-4" />
            Сохранить avatar prompt
          </Button>
        </div>
      </WorkbenchPanel>

      <WorkbenchPanel
        title="План видео"
        description="Сценарий превращается в production plan: 3-4 сегмента по 10 секунд, снапшоты refs и prompt contract."
      >
        <div className="grid gap-2 rounded-lg bg-muted/30 p-3">
          <ReadinessItem done={Boolean(activeProject)} label="Карточка клиента выбрана" />
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
          Собрать план сегментов
        </Button>
      </WorkbenchPanel>

      <WorkbenchPanel title="Reel jobs" description="Очередь планов и 10-секундных сегментов. Submit/poll/stitch станут отдельными действиями.">
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
              <div className="mt-3">
                <SegmentDots segments={segments.filter((segment) => segment.reel_id === reel.id)} />
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
