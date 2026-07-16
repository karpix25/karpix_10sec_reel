"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ExternalLink,
  FileText,
  Film,
  ListFilter,
  Maximize2,
  Minimize2,
  Play,
  RefreshCw,
  Video,
  WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { extractOpenRouterCostSummaryFromSnapshot } from "@/lib/omni/openrouter-cost";
import type { OmniGenerationProvider } from "@/lib/omni/provider";
import type { OmniGeneratedScript, OmniReel, OmniReelSegment } from "@/lib/omni/types";
import { GeneratedScriptPromptTabs } from "./GeneratedScriptPromptTabs";
import {
  PendingGeneratedScriptCard,
  PendingVideoCard,
  type PendingScriptDraft,
  type PendingVideoDraft,
} from "./GenerationPendingCards";
import { OpenRouterCostBadge } from "./OpenRouterCostBadge";
import { OriginalReferenceLink } from "./OriginalReferenceLink";
import { SegmentDots, StatusBadge } from "./OmniStudio/ui";
import { ReelSubtitlesPanel } from "./ReelSubtitlesPanel";
import { getVideoStageLabel, VideoProgressSteps } from "./VideoProgressStatus";

type VideoFilter = "all" | "none" | "active" | "completed" | "failed";
type ViewMode = "compact" | "detail";
type CardTab = "script" | "video" | "prompts";

type ScriptWithVideo = {
  script: OmniGeneratedScript;
  reels: OmniReel[];
  latestReel: OmniReel | null;
  latestSegments: OmniReelSegment[];
};

const STORAGE_KEY = "omni-generated-scripts-list-v1";

const FILTERS: Array<{ value: VideoFilter; label: string }> = [
  { value: "all", label: "Все" },
  { value: "none", label: "Без видео" },
  { value: "active", label: "В процессе" },
  { value: "completed", label: "Готово" },
  { value: "failed", label: "Ошибка" },
];

export function GeneratedScriptsList({
  projectId,
  productId,
  scripts,
  isLoading,
  pendingDraft,
  pendingVideo,
  omniGenerationProvider,
  canCreateVideo,
  isCreatingReel,
  isRunningReel,
  isSyncingReel,
  reels,
  segments,
  onCreateVideo,
  onRunReel,
  onSyncReel,
}: {
  projectId: number | null;
  productId: number | null;
  scripts: OmniGeneratedScript[];
  isLoading: boolean;
  pendingDraft: PendingScriptDraft | null;
  pendingVideo: PendingVideoDraft | null;
  omniGenerationProvider: OmniGenerationProvider;
  canCreateVideo: boolean;
  isCreatingReel: boolean;
  isRunningReel: boolean;
  isSyncingReel: boolean;
  reels: OmniReel[];
  segments: OmniReelSegment[];
  onCreateVideo: (scriptId: number) => void;
  onRunReel: (reelId: number) => void;
  onSyncReel: (reelId: number) => void;
}) {
  const [expandedScriptId, setExpandedScriptId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<CardTab>("video");
  const [viewMode, setViewMode] = useState<ViewMode>("compact");
  const [filter, setFilter] = useState<VideoFilter>("all");

  useEffect(() => {
    let isMounted = true;
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") as {
        expandedScriptId?: number;
        activeTab?: CardTab;
        viewMode?: ViewMode;
        filter?: VideoFilter;
      };
      window.setTimeout(() => {
        if (!isMounted) return;
        setExpandedScriptId(saved.expandedScriptId || null);
        if (saved.activeTab) setActiveTab(saved.activeTab);
        if (saved.viewMode) setViewMode(saved.viewMode);
        if (saved.filter) setFilter(saved.filter);
      }, 0);
    } catch {
      // Keep defaults when localStorage contains stale data.
    }
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ expandedScriptId, activeTab, viewMode, filter }));
  }, [expandedScriptId, activeTab, viewMode, filter]);

  const items = useMemo(
    () =>
      scripts.map((script): ScriptWithVideo => {
        const scriptReels = reels.filter(
          (reel) =>
            reel.source_generated_script_id === script.id ||
            (!reel.source_generated_script_id &&
              Boolean(script.source_legacy_scenario_id) &&
              reel.source_legacy_scenario_id === script.source_legacy_scenario_id)
        );
        const latestReel = scriptReels[0] || null;
        const latestSegments = latestReel ? segments.filter((segment) => segment.reel_id === latestReel.id) : [];
        return { script, reels: scriptReels, latestReel, latestSegments };
      }),
    [reels, scripts, segments]
  );
  const visibleItems = items.filter((item) => matchesVideoFilter(item.latestReel, filter));

  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-5">
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Draft-сценарии</p>
          <h3 className="mt-1 text-lg font-semibold text-foreground">Созданные сценарии</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1">
            <ListFilter className="ml-2 h-4 w-4 text-muted-foreground" />
            {FILTERS.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={filter === option.value ? "secondary" : "ghost"}
                onClick={() => setFilter(option.value)}
                className="h-8 px-2 text-xs"
              >
                {option.label}
              </Button>
            ))}
          </div>
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => setViewMode((current) => (current === "compact" ? "detail" : "compact"))}
            title={viewMode === "compact" ? "Подробный режим" : "Компактный режим"}
            aria-label={viewMode === "compact" ? "Подробный режим" : "Компактный режим"}
            className="h-10 w-10"
          >
            {viewMode === "compact" ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
          </Button>
          <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
            {visibleItems.length}/{scripts.length + (pendingDraft ? 1 : 0)}
          </span>
        </div>
      </div>

      <div className="grid min-w-0 gap-3">
        {pendingDraft ? <PendingGeneratedScriptCard draft={pendingDraft} /> : null}
        {visibleItems.map((item) => (
          <GeneratedScriptCard
            key={item.script.id}
            item={item}
            projectId={projectId}
            productId={productId}
            pendingVideo={pendingVideo}
            omniGenerationProvider={omniGenerationProvider}
            canCreateVideo={canCreateVideo}
            isCreatingReel={isCreatingReel}
            isRunningReel={isRunningReel}
            isSyncingReel={isSyncingReel}
            isExpanded={viewMode === "detail" || expandedScriptId === item.script.id}
            activeTab={activeTab}
            onToggle={() => setExpandedScriptId((current) => (current === item.script.id ? null : item.script.id))}
            onTabChange={setActiveTab}
            onCreateVideo={onCreateVideo}
            onRunReel={onRunReel}
            onSyncReel={onSyncReel}
          />
        ))}
        {!visibleItems.length && !isLoading && !pendingDraft ? (
          <div className="rounded-lg border border-dashed border-border bg-background p-6 text-center text-sm text-muted-foreground">
            {scripts.length ? "По выбранному фильтру ничего нет." : "Нажмите «Написать сценарий», и здесь появится первый draft."}
          </div>
        ) : null}
        {isLoading ? (
          <div className="rounded-lg border border-border bg-background p-6 text-sm text-muted-foreground">
            Загружаю сценарии...
          </div>
        ) : null}
      </div>
    </div>
  );
}

function GeneratedScriptCard({
  item,
  projectId,
  productId,
  pendingVideo,
  omniGenerationProvider,
  canCreateVideo,
  isCreatingReel,
  isRunningReel,
  isSyncingReel,
  isExpanded,
  activeTab,
  onToggle,
  onTabChange,
  onCreateVideo,
  onRunReel,
  onSyncReel,
}: {
  item: ScriptWithVideo;
  projectId: number | null;
  productId: number | null;
  pendingVideo: PendingVideoDraft | null;
  omniGenerationProvider: OmniGenerationProvider;
  canCreateVideo: boolean;
  isCreatingReel: boolean;
  isRunningReel: boolean;
  isSyncingReel: boolean;
  isExpanded: boolean;
  activeTab: CardTab;
  onToggle: () => void;
  onTabChange: (tab: CardTab) => void;
  onCreateVideo: (scriptId: number) => void;
  onRunReel: (reelId: number) => void;
  onSyncReel: (reelId: number) => void;
}) {
  const { script, latestReel, latestSegments } = item;
  const videoStage = latestReel ? getVideoStageLabel(latestReel, latestSegments) : "Видео ещё не создавалось";
  const costSummary = extractOpenRouterCostSummaryFromSnapshot(script.source_snapshot);

  return (
    <article className="min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-background">
      <div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <button type="button" onClick={onToggle} className="min-w-0 text-left">
          <div className="flex min-w-0 items-start gap-3">
            <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition ${isExpanded ? "rotate-180" : ""}`} />
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-semibold text-foreground">
                {script.hook || script.title || "Сценарий без заголовка"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Ref #{script.source_legacy_scenario_id || "n/a"} · {new Date(script.created_at).toLocaleString("ru-RU")}
              </p>
              <p className="mt-2 line-clamp-2 text-sm leading-5 text-muted-foreground">{script.script}</p>
            </div>
          </div>
        </button>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {costSummary ? <OpenRouterCostBadge summary={costSummary} /> : null}
          <OriginalReferenceLink script={script} />
          <div className="min-w-36 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
            <span className="block truncate font-semibold text-foreground">{videoStage}</span>
            {latestReel ? <span>Reel #{latestReel.id}</span> : <span>draft</span>}
          </div>
          {latestReel ? <StatusBadge status={latestReel.status} /> : null}
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => onCreateVideo(script.id)}
            disabled={!canCreateVideo || isCreatingReel || pendingVideo?.scriptId === script.id}
            title="Создать видео"
            aria-label="Создать видео"
            className="h-9 w-9"
          >
            <Film className="h-4 w-4" />
          </Button>
          {latestReel ? (
            <>
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => onRunReel(latestReel.id)}
                disabled={isRunningReel || latestReel.status === "completed"}
                title="Запустить сегменты"
                aria-label="Запустить сегменты"
                className="h-9 w-9"
              >
                <Play className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => onSyncReel(latestReel.id)}
                disabled={isSyncingReel}
                title="Проверить статус и собрать"
                aria-label="Проверить статус и собрать"
                className="h-9 w-9"
              >
                <RefreshCw className={`h-4 w-4 ${isSyncingReel ? "animate-spin" : ""}`} />
              </Button>
            </>
          ) : (
            <FileText className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {!isExpanded ? null : (
        <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as CardTab)} className="border-t border-border">
          <div className="overflow-x-auto px-4 py-3">
            <TabsList className="h-9">
              <TabsTrigger value="script" className="min-w-24 px-3">Сценарий</TabsTrigger>
              <TabsTrigger value="video" className="min-w-24 px-3">Видео</TabsTrigger>
              <TabsTrigger value="prompts" className="min-w-24 px-3">Prompts</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="script" className="px-4 pb-4">
            <pre className="max-h-72 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-3 text-sm leading-6 text-foreground">
              {script.script}
            </pre>
            {script.caption ? (
              <p className="mt-3 max-w-full overflow-hidden break-words rounded-lg border border-border bg-card p-3 text-sm leading-6 text-muted-foreground">
                {script.caption}
              </p>
            ) : null}
          </TabsContent>
          <TabsContent value="video" className="px-4 pb-4">
            <VideoPanel
              reel={latestReel}
              segments={latestSegments}
              pendingVideo={pendingVideo?.scriptId === script.id}
              omniGenerationProvider={omniGenerationProvider}
            />
          </TabsContent>
          <TabsContent value="prompts" className="px-4 pb-4">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
              <WandSparkles className="h-4 w-4 text-primary" />
              Prompts загружаются только для раскрытой карточки.
            </div>
            <GeneratedScriptPromptTabs projectId={projectId} productId={productId} scriptId={script.id} />
          </TabsContent>
        </Tabs>
      )}
    </article>
  );
}

function VideoPanel({
  reel,
  segments,
  pendingVideo,
  omniGenerationProvider,
}: {
  reel: OmniReel | null;
  segments: OmniReelSegment[];
  pendingVideo: boolean;
  omniGenerationProvider: OmniGenerationProvider;
}) {
  const [currentReel, setCurrentReel] = useState(reel);

  useEffect(() => {
    setCurrentReel(reel);
  }, [reel]);

  if (!currentReel) return pendingVideo ? <PendingVideoCard provider={omniGenerationProvider} /> : <EmptyVideoPanel />;

  const displayVideoUrl = currentReel.subtitled_video_url || currentReel.final_video_url;
  const isShowingSubtitled = Boolean(currentReel.subtitled_video_url);

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
          <video
            key={displayVideoUrl}
            src={displayVideoUrl}
            controls
            playsInline
            className="aspect-[9/16] max-h-[34rem] w-full object-contain"
          />
        </div>
      ) : null}
      {isShowingSubtitled ? (
        <p className="mt-2 text-xs text-muted-foreground">Показываю версию с burned-in субтитрами.</p>
      ) : null}

      {segments.length ? (
        <div className="mt-3 space-y-3">
          <SegmentDots segments={segments} />
          <VideoProgressSteps reel={currentReel} segments={segments} />
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {displayVideoUrl ? (
          <ExternalIconLink href={displayVideoUrl} label="Открыть S3 preview">
            <Video className="h-4 w-4" />
          </ExternalIconLink>
        ) : null}
        {currentReel.yandex_public_url ? (
          <ExternalIconLink href={currentReel.yandex_public_url} label="Открыть на Яндекс Диске">
            <ExternalLink className="h-4 w-4" />
          </ExternalIconLink>
        ) : null}
        {currentReel.yandex_disk_path ? (
          <span className="min-w-0 truncate rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
            {currentReel.yandex_disk_path}
          </span>
        ) : null}
      </div>

      {currentReel.final_video_url ? <ReelSubtitlesPanel reel={currentReel} onReelUpdate={setCurrentReel} /> : null}
    </div>
  );
}

function EmptyVideoPanel() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
      Видео ещё не создавалось. Нажмите иконку с плёнкой в карточке.
    </div>
  );
}

function ExternalIconLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-primary hover:bg-muted"
      title={label}
      aria-label={label}
    >
      {children}
    </a>
  );
}

function matchesVideoFilter(reel: OmniReel | null, filter: VideoFilter) {
  if (filter === "all") return true;
  if (filter === "none") return !reel;
  if (!reel) return false;
  if (filter === "completed") return reel.status === "completed";
  if (filter === "failed") return reel.status === "failed";
  return ["queued", "generating", "stitching"].includes(reel.status);
}
