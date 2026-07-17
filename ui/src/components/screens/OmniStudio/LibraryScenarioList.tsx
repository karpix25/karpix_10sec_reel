"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ExternalLink,
  FileText,
  Film,
  ListFilter,
  Maximize2,
  Minimize2,
  PenLine,
  Play,
  RefreshCw,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getOmniReelSubtitleCue } from "@/lib/omni/subtitle-status-labels";
import type {
  OmniClientAvatar,
  OmniLegacyScenario,
  OmniProduct,
  OmniReel,
  OmniReelSegment,
} from "@/lib/omni/types";
import { OmniSegmentPromptDetails } from "./OmniSegmentPromptDetails";
import { EmptyState, SegmentDots, StatusBadge } from "./ui";

type VideoFilter = "all" | "none" | "active" | "completed" | "failed";
type ViewMode = "compact" | "detail";
type CardTab = "script" | "video" | "prompts";

type ScenarioWithVideo = {
  scenario: OmniLegacyScenario;
  latestReel: OmniReel | null;
  latestSegments: OmniReelSegment[];
};

const STORAGE_KEY = "omni-library-scenario-list-v1";

const FILTERS: Array<{ value: VideoFilter; label: string }> = [
  { value: "all", label: "Все" },
  { value: "none", label: "Без видео" },
  { value: "active", label: "В процессе" },
  { value: "completed", label: "Готово" },
  { value: "failed", label: "Ошибка" },
];

function getScriptHook(script: string) {
  const normalized = script.replace(/\s+/g, " ").trim();
  if (!normalized) return "Скрипт без текста";
  const sentenceMatch = normalized.match(/^(.{24,180}?[.!?])\s/);
  return sentenceMatch?.[1] || normalized.slice(0, 160);
}

export function LibraryScenarioList({
  scenarios,
  activeProduct,
  latestAvatar,
  reels,
  segments,
  selectedScenarioId,
  isScenariosLoading,
  onSelectScenario,
  onCreateScenarioScript,
  onCreateScenarioVideo,
  onRunReel,
  onSyncReel,
  isCreatingScript,
  isCreatingReel,
  isRunningReel,
  isSyncingReel,
}: {
  scenarios: OmniLegacyScenario[];
  activeProduct: OmniProduct | null;
  latestAvatar: OmniClientAvatar | null;
  reels: OmniReel[];
  segments: OmniReelSegment[];
  selectedScenarioId: number | null;
  isScenariosLoading: boolean;
  onSelectScenario: (scenarioId: number) => void;
  onCreateScenarioScript: (scenarioId: number) => void;
  onCreateScenarioVideo: (scenarioId: number) => void;
  onRunReel: (reelId: number) => void;
  onSyncReel: (reelId: number) => void;
  isCreatingReel: boolean;
  isCreatingScript: boolean;
  isRunningReel: boolean;
  isSyncingReel: boolean;
}) {
  const [expandedScenarioId, setExpandedScenarioId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<CardTab>("video");
  const [viewMode, setViewMode] = useState<ViewMode>("compact");
  const [filter, setFilter] = useState<VideoFilter>("all");

  useEffect(() => {
    let isMounted = true;
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") as {
        expandedScenarioId?: number;
        activeTab?: CardTab;
        viewMode?: ViewMode;
        filter?: VideoFilter;
      };
      window.setTimeout(() => {
        if (!isMounted) return;
        setExpandedScenarioId(saved.expandedScenarioId || null);
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
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ expandedScenarioId, activeTab, viewMode, filter }));
  }, [expandedScenarioId, activeTab, viewMode, filter]);

  const items = useMemo(
    () =>
      scenarios.map((scenario): ScenarioWithVideo => {
        const scenarioReels = reels.filter((reel) => reel.source_legacy_scenario_id === scenario.id);
        const latestReel = scenarioReels[0] || null;
        const latestSegments = latestReel ? segments.filter((segment) => segment.reel_id === latestReel.id) : [];
        return { scenario, latestReel, latestSegments };
      }),
    [reels, scenarios, segments]
  );
  const visibleItems = items.filter((item) => matchesVideoFilter(item.latestReel, filter));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-background p-1">
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
      </div>
      <div className="grid max-h-[34rem] gap-2 overflow-auto pr-1">
        {visibleItems.map((item) => (
          <LibraryScenarioCard
            key={item.scenario.id}
            item={item}
            isSelected={item.scenario.id === selectedScenarioId}
            isExpanded={viewMode === "detail" || expandedScenarioId === item.scenario.id}
            activeTab={activeTab}
            canCreateScript={Boolean(activeProduct)}
            canCreateVideo={Boolean(activeProduct && latestAvatar)}
            isCreatingScript={isCreatingScript}
            isCreatingReel={isCreatingReel}
            isRunningReel={isRunningReel}
            isSyncingReel={isSyncingReel}
            onToggle={() => setExpandedScenarioId((current) => (current === item.scenario.id ? null : item.scenario.id))}
            onTabChange={setActiveTab}
            onSelectScenario={onSelectScenario}
            onCreateScenarioScript={onCreateScenarioScript}
            onCreateScenarioVideo={onCreateScenarioVideo}
            onRunReel={onRunReel}
            onSyncReel={onSyncReel}
          />
        ))}
        {!visibleItems.length && !isScenariosLoading ? (
          <EmptyState
            title={scenarios.length ? "По фильтру ничего нет" : "Транскрибации не найдены"}
            description={
              scenarios.length
                ? "Выберите другой статус видео."
                : "В этом бандле нет reference-транскрибаций под текущий поиск."
            }
          />
        ) : null}
      </div>
    </div>
  );
}

function LibraryScenarioCard({
  item,
  isSelected,
  isExpanded,
  activeTab,
  canCreateScript,
  canCreateVideo,
  isCreatingScript,
  isCreatingReel,
  isRunningReel,
  isSyncingReel,
  onToggle,
  onTabChange,
  onSelectScenario,
  onCreateScenarioScript,
  onCreateScenarioVideo,
  onRunReel,
  onSyncReel,
}: {
  item: ScenarioWithVideo;
  isSelected: boolean;
  isExpanded: boolean;
  activeTab: CardTab;
  canCreateScript: boolean;
  canCreateVideo: boolean;
  isCreatingScript: boolean;
  isCreatingReel: boolean;
  isRunningReel: boolean;
  isSyncingReel: boolean;
  onToggle: () => void;
  onTabChange: (tab: CardTab) => void;
  onSelectScenario: (scenarioId: number) => void;
  onCreateScenarioScript: (scenarioId: number) => void;
  onCreateScenarioVideo: (scenarioId: number) => void;
  onRunReel: (reelId: number) => void;
  onSyncReel: (reelId: number) => void;
}) {
  const { scenario, latestReel, latestSegments } = item;

  return (
    <article className={`overflow-hidden rounded-lg border ${isSelected ? "border-primary bg-primary/5" : "border-border bg-background"}`}>
      <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <button type="button" onClick={onToggle} className="min-w-0 text-left">
          <div className="flex min-w-0 items-start gap-3">
            <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition ${isExpanded ? "rotate-180" : ""}`} />
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">{getScriptHook(scenario.script)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {scenario.word_count ? `${scenario.word_count} слов` : "слов: n/a"}
                {scenario.duration_seconds ? ` · ${scenario.duration_seconds} сек` : ""}
              </p>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{scenario.script}</p>
            </div>
          </div>
        </button>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {latestReel ? <StatusBadge status={latestReel.status} /> : null}
          <Button
            type="button"
            size="icon"
            variant={isSelected ? "default" : "outline"}
            onClick={() => onSelectScenario(scenario.id)}
            title={isSelected ? "Сценарий выбран" : "Выбрать сценарий"}
            aria-label={isSelected ? "Сценарий выбран" : "Выбрать сценарий"}
            className="h-9 w-9"
          >
            {isSelected ? <Check className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => onCreateScenarioScript(scenario.id)}
            disabled={!canCreateScript || isCreatingScript}
            title="Написать draft по этому оригиналу"
            aria-label="Написать draft по этому оригиналу"
            className="h-9 w-9"
          >
            <PenLine className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => onCreateScenarioVideo(scenario.id)}
            disabled={!canCreateVideo || isCreatingReel}
            title="Создать видео из этого сценария"
            aria-label="Создать видео из этого сценария"
            className="h-9 w-9"
          >
            <Film className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!isExpanded ? null : (
        <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as CardTab)} className="border-t border-border">
          <div className="overflow-x-auto px-3 py-2">
            <TabsList className="h-9">
              <TabsTrigger value="script" className="min-w-24 px-3">Сценарий</TabsTrigger>
              <TabsTrigger value="video" className="min-w-24 px-3">Видео</TabsTrigger>
              <TabsTrigger value="prompts" className="min-w-24 px-3">Prompts</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="script" className="px-3 pb-3">
            {scenario.reels_url ? (
              <a href={scenario.reels_url} target="_blank" rel="noreferrer" className="mb-2 inline-flex max-w-full text-xs font-medium text-primary hover:underline">
                <span className="truncate">{scenario.reels_url}</span>
              </a>
            ) : null}
            <p className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted/35 p-3 text-xs leading-5 text-muted-foreground">
              {scenario.script}
            </p>
          </TabsContent>
          <TabsContent value="video" className="px-3 pb-3">
            <LibraryVideoPanel
              reel={latestReel}
              segments={latestSegments}
              isRunningReel={isRunningReel}
              isSyncingReel={isSyncingReel}
              onRunReel={onRunReel}
              onSyncReel={onSyncReel}
            />
          </TabsContent>
          <TabsContent value="prompts" className="px-3 pb-3">
            <SegmentPromptPanel segments={latestSegments} strategy={latestReel?.creative_strategy} />
          </TabsContent>
        </Tabs>
      )}
    </article>
  );
}

function LibraryVideoPanel({
  reel,
  segments,
  isRunningReel,
  isSyncingReel,
  onRunReel,
  onSyncReel,
}: {
  reel: OmniReel | null;
  segments: OmniReelSegment[];
  isRunningReel: boolean;
  isSyncingReel: boolean;
  onRunReel: (reelId: number) => void;
  onSyncReel: (reelId: number) => void;
}) {
  if (!reel) {
    return <div className="rounded-lg border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">Видео по этому сценарию еще не создано.</div>;
  }
  const displayVideoUrl = reel.subtitled_video_url || reel.final_video_url;
  const subtitleCue = getOmniReelSubtitleCue(reel);

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Видео</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Reel #{reel.id} · {reel.target_duration_seconds} сек · {reel.segment_count} сегмента
          </p>
        </div>
        <StatusBadge status={reel.status} />
      </div>

      {displayVideoUrl ? (
        <div className="mt-3 overflow-hidden rounded-lg border border-border bg-black">
          <video src={displayVideoUrl} controls playsInline className="aspect-[9/16] max-h-[34rem] w-full object-contain" />
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
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
          type="button"
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
        {displayVideoUrl ? (
          <ExternalIconLink href={displayVideoUrl} label="Открыть S3 preview">
            <Video className="h-4 w-4" />
          </ExternalIconLink>
        ) : null}
        {reel.yandex_public_url ? (
          <ExternalIconLink href={reel.yandex_public_url} label="Открыть на Яндекс Диске">
            <ExternalLink className="h-4 w-4" />
          </ExternalIconLink>
        ) : null}
        {subtitleCue ? <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{subtitleCue}</span> : null}
      </div>

      {segments.length ? (
        <div className="mt-3 space-y-2">
          <SegmentDots segments={segments} />
        </div>
      ) : null}
      {reel.yandex_disk_path ? <p className="mt-2 truncate text-xs text-muted-foreground">Yandex: {reel.yandex_disk_path}</p> : null}
      {reel.yandex_status === "failed" && reel.yandex_error ? (
        <p className="mt-2 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">{reel.yandex_error}</p>
      ) : null}
    </div>
  );
}

function SegmentPromptPanel({
  segments,
  strategy,
}: {
  segments: OmniReelSegment[];
  strategy?: OmniReel["creative_strategy"];
}) {
  if (!segments.length) {
    return <div className="rounded-lg border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">Prompts появятся после создания reel.</div>;
  }
  return (
    <div className="grid gap-2">
      {segments.map((segment) => (
        <div key={segment.id} className="rounded-md bg-muted/35 p-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-primary">
              Segment {segment.segment_index} · {segment.slot_role || "body"}
            </p>
            <StatusBadge status={segment.status} />
          </div>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
            {segment.prompt || "Prompt пока не подготовлен."}
          </pre>
          <OmniSegmentPromptDetails
            prompt={segment.prompt}
            voiceoverText={segment.voiceover_text}
            creativeStrategy={strategy}
            creativePlan={segment.creative_plan}
            validation={segment.prompt_validation}
          />
        </div>
      ))}
    </div>
  );
}

function ExternalIconLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={label}
      aria-label={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-primary hover:bg-muted"
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
