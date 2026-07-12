"use client";

import { Archive, Check, CheckCircle2, ExternalLink, FileText, Film, Play, RefreshCw, Search, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  OmniClientAvatar,
  OmniLegacyLibrary,
  OmniLegacyLibraryLink,
  OmniLegacyScenario,
  OmniProduct,
  OmniReel,
  OmniReelSegment,
} from "@/lib/omni/types";
import { OmniSegmentPromptDetails } from "./OmniSegmentPromptDetails";
import { EmptyState, QueryState, SegmentDots, StatusBadge, WorkbenchPanel } from "./ui";

function getScriptHook(script: string) {
  const normalized = script.replace(/\s+/g, " ").trim();
  if (!normalized) return "Скрипт без текста";
  const sentenceMatch = normalized.match(/^(.{24,180}?[.!?])\s/);
  return sentenceMatch?.[1] || normalized.slice(0, 160);
}

export function LibraryScenarioPanel({
  libraries,
  libraryLinks,
  scenarios,
  activeProduct,
  latestAvatar,
  reels,
  segments,
  activeLibraryId,
  selectedScenarioId,
  legacySearch,
  totalScenarios,
  isLibrariesLoading,
  isScenariosLoading,
  isLibrariesError,
  isScenariosError,
  isActivatingBundle,
  isDeactivatingBundle,
  isCreatingReel,
  isRunningReel,
  isSyncingReel,
  onSearchChange,
  onSelectLibrary,
  onActivateBundle,
  onDeactivateBundle,
  onSelectScenario,
  onCreateScenarioVideo,
  onRunReel,
  onSyncReel,
}: {
  libraries: OmniLegacyLibrary[];
  libraryLinks: OmniLegacyLibraryLink[];
  scenarios: OmniLegacyScenario[];
  activeProduct: OmniProduct | null;
  latestAvatar: OmniClientAvatar | null;
  reels: OmniReel[];
  segments: OmniReelSegment[];
  activeLibraryId: number | null;
  selectedScenarioId: number | null;
  legacySearch: string;
  totalScenarios: number;
  isLibrariesLoading: boolean;
  isScenariosLoading: boolean;
  isLibrariesError: boolean;
  isScenariosError: boolean;
  isActivatingBundle: boolean;
  isDeactivatingBundle: boolean;
  isCreatingReel: boolean;
  isRunningReel: boolean;
  isSyncingReel: boolean;
  onSearchChange: (value: string) => void;
  onSelectLibrary: (legacyClientId: number) => void;
  onActivateBundle: (legacyClientId: number) => void;
  onDeactivateBundle: (legacyClientId: number) => void;
  onSelectScenario: (scenarioId: number) => void;
  onCreateScenarioVideo: (scenarioId: number) => void;
  onRunReel: (reelId: number) => void;
  onSyncReel: (reelId: number) => void;
}) {
  const activeBundleIds = new Set(libraryLinks.map((link) => link.legacy_client_id));
  const librariesById = new Map(libraries.map((library) => [library.client_id, library]));
  const selectedBundle = libraries.find((library) => library.client_id === activeLibraryId) || null;
  const activeLibraries = Array.from(activeBundleIds).map(
    (clientId) =>
      librariesById.get(clientId) || {
        client_id: clientId,
        name: `Legacy bundle #${clientId}`,
        product_info: null,
        product_keyword: null,
        niche: null,
        scenario_count: 0,
        last_scenario_at: null,
      }
  );
  const inactiveLibraries = libraries.filter((library) => !activeBundleIds.has(library.client_id));

  return (
    <div className="space-y-4">
      <WorkbenchPanel
        title="Активные бандлы"
        description="Эти legacy-бандлы уже подключены к текущему проекту и будут использоваться в production-контуре."
      >
        <div className="grid gap-2">
          {activeLibraries.map((library) => {
            const isActive = activeLibraryId === library.client_id;
            return (
              <div
                key={library.client_id}
                className={`rounded-lg border p-3 transition ${
                  isActive ? "border-primary bg-primary/5" : "border-emerald-200 bg-emerald-50"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectLibrary(library.client_id)}
                  className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                        <p className="truncate text-sm font-semibold text-foreground">{library.name}</p>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {library.product_keyword || library.product_info || library.niche || "Legacy project bundle"}
                      </p>
                    </div>
                    <div className="shrink-0 rounded-md bg-white/70 px-2 py-1 text-xs font-medium text-muted-foreground">
                      {library.scenario_count} refs
                    </div>
                  </div>
                </button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => onDeactivateBundle(library.client_id)}
                  disabled={isActivatingBundle || isDeactivatingBundle}
                  className="mt-3 min-h-9"
                >
                  Выключить
                </Button>
              </div>
            );
          })}
          {!activeLibraries.length ? (
            <EmptyState
              title="Активных бандлов пока нет"
              description="Нажмите «Активировать бандл» в legacy-списке ниже, и он появится в этом фрейме."
            />
          ) : null}
        </div>
      </WorkbenchPanel>

      <WorkbenchPanel
        title="Legacy-бандлы"
        description="Доступные бандлы из старых проектов. После активации бандл перемещается в верхний фрейм."
      >
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={legacySearch}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Поиск бандла по проекту, продукту или описанию"
            className="h-11 pl-9"
          />
        </div>
        <QueryState
          isLoading={isLibrariesLoading}
          isError={isLibrariesError}
          loadingText="Загружаю legacy-библиотеки"
          errorText="Legacy DB недоступна"
        />
        <div className="grid max-h-80 gap-2 overflow-auto pr-1">
          {inactiveLibraries.map((library) => {
            const isActive = activeLibraryId === library.client_id;
            return (
              <div
                key={library.client_id}
                className={`rounded-lg border p-3 transition ${
                  isActive ? "border-primary bg-primary/5" : "border-border bg-background"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectLibrary(library.client_id)}
                  className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Archive className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <p className="truncate text-sm font-semibold text-foreground">{library.name}</p>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {library.product_keyword || library.product_info || library.niche || "Legacy project bundle"}
                      </p>
                    </div>
                    <div className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                      {library.scenario_count} refs
                    </div>
                  </div>
                </button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onSelectLibrary(library.client_id);
                    onActivateBundle(library.client_id);
                  }}
                  disabled={isActivatingBundle || isDeactivatingBundle}
                  className="mt-3 min-h-9"
                >
                  Активировать бандл
                </Button>
              </div>
            );
          })}
          {!inactiveLibraries.length && !isLibrariesLoading && (
            <EmptyState
              title={libraries.length ? "Все найденные бандлы активны" : "Бандлы не найдены"}
              description={
                libraries.length
                  ? "Активные бандлы находятся в верхнем фрейме."
                  : "Попробуй другой поиск или проверь доступность старой БД."
              }
            />
          )}
        </div>
      </WorkbenchPanel>

      <WorkbenchPanel
        title="Референс-транскрибации в бандле"
        description={
          selectedBundle
            ? `${totalScenarios} транскрибаций reference-видео в бандле «${selectedBundle.name}»`
            : "Выберите бандл, чтобы увидеть оригинальные транскрибации reference-видео внутри него."
        }
      >
        <QueryState
          isLoading={isScenariosLoading}
          isError={isScenariosError}
          loadingText="Загружаю транскрибации"
          errorText="Не удалось загрузить транскрибации"
        />
        {!activeLibraryId ? (
          <EmptyState
            title="Бандл не выбран"
            description="Сначала выберите старый проект/продукт слева. Затем можно активировать бандл целиком для текущего проекта."
          />
        ) : (
          <div className="grid max-h-[34rem] gap-2 overflow-auto pr-1">
            {scenarios.map((scenario) => {
              const isSelected = scenario.id === selectedScenarioId;
              const scenarioReels = reels.filter((reel) => reel.source_legacy_scenario_id === scenario.id);
              const latestReel = scenarioReels[0] || null;
              const latestSegments = latestReel
                ? segments.filter((segment) => segment.reel_id === latestReel.id)
                : [];
              return (
                <div
                  key={scenario.id}
                  className={`min-h-24 rounded-lg border p-3 ${
                    isSelected ? "border-primary bg-primary/5" : "border-border bg-background"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">
                        {getScriptHook(scenario.script)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Оригинальная транскрибация референса
                      </p>
                      {scenario.reels_url ? (
                        <a
                          href={scenario.reels_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex max-w-full text-xs font-medium text-primary hover:underline"
                        >
                          <span className="truncate">{scenario.reels_url}</span>
                        </a>
                      ) : null}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {scenario.word_count ? `${scenario.word_count} слов` : "слов: n/a"}
                        {scenario.duration_seconds ? ` · ${scenario.duration_seconds} сек` : ""}
                      </p>
                      <p className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded-md bg-muted/35 p-2 text-xs leading-5 text-muted-foreground">
                        {scenario.script}
                      </p>
                    </div>
                    <div className="mt-1 flex shrink-0 flex-col gap-2">
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
                        onClick={() => onCreateScenarioVideo(scenario.id)}
                        disabled={!activeProduct || !latestAvatar || isCreatingReel}
                        title="Создать видео из этого сценария"
                        aria-label="Создать видео из этого сценария"
                        className="h-9 w-9"
                      >
                        <Film className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 rounded-lg border border-border bg-card p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Видео</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {latestReel
                            ? `Reel #${latestReel.id} · ${latestReel.target_duration_seconds} сек · ${latestReel.segment_count} сегмента`
                            : "Видео по этому сценарию еще не создано"}
                        </p>
                      </div>
                      {latestReel ? <StatusBadge status={latestReel.status} /> : null}
                    </div>

                    {latestReel?.final_video_url ? (
                      <div className="mt-3 overflow-hidden rounded-lg border border-border bg-black">
                        <video
                          src={latestReel.final_video_url}
                          controls
                          playsInline
                          className="aspect-[9/16] max-h-[34rem] w-full object-contain"
                        />
                      </div>
                    ) : null}

                    {latestReel ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
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
                        {latestReel.final_video_url ? (
                          <a
                            href={latestReel.final_video_url}
                            target="_blank"
                            rel="noreferrer"
                            title="Открыть S3 preview"
                            aria-label="Открыть S3 preview"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-primary hover:bg-muted"
                          >
                            <Video className="h-4 w-4" />
                          </a>
                        ) : null}
                        {latestReel.yandex_public_url ? (
                          <a
                            href={latestReel.yandex_public_url}
                            target="_blank"
                            rel="noreferrer"
                            title="Открыть на Яндекс Диске"
                            aria-label="Открыть на Яндекс Диске"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-primary hover:bg-muted"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        ) : null}
                      </div>
                    ) : null}

                    {latestSegments.length ? (
                      <div className="mt-3 space-y-2">
                        <SegmentDots segments={latestSegments} />
                        <details className="rounded-md border border-border bg-background">
                          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-foreground">
                            Omni prompts сегментов
                          </summary>
                          <div className="grid gap-2 border-t border-border p-2">
                            {latestSegments.map((segment) => (
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
                                <OmniSegmentPromptDetails prompt={segment.prompt} />
                              </div>
                            ))}
                          </div>
                        </details>
                      </div>
                    ) : null}

                    {latestReel?.yandex_disk_path ? (
                      <p className="mt-2 truncate text-xs text-muted-foreground">Yandex: {latestReel.yandex_disk_path}</p>
                    ) : null}
                    {latestReel?.yandex_status === "failed" && latestReel.yandex_error ? (
                      <p className="mt-2 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
                        {latestReel.yandex_error}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {!scenarios.length && !isScenariosLoading && (
              <EmptyState title="Транскрибации не найдены" description="В этом бандле нет reference-транскрибаций под текущий поиск." />
            )}
          </div>
        )}
      </WorkbenchPanel>
    </div>
  );
}
