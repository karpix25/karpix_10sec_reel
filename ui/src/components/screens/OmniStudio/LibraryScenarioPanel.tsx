"use client";

import { Archive, CheckCircle2, Search } from "lucide-react";
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
import { LibraryScenarioList } from "./LibraryScenarioList";
import { EmptyState, QueryState, WorkbenchPanel } from "./ui";

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
          <LibraryScenarioList
            scenarios={scenarios}
            activeProduct={activeProduct}
            latestAvatar={latestAvatar}
            reels={reels}
            segments={segments}
            selectedScenarioId={selectedScenarioId}
            isScenariosLoading={isScenariosLoading}
            isCreatingReel={isCreatingReel}
            isRunningReel={isRunningReel}
            isSyncingReel={isSyncingReel}
            onSelectScenario={onSelectScenario}
            onCreateScenarioVideo={onCreateScenarioVideo}
            onRunReel={onRunReel}
            onSyncReel={onSyncReel}
          />
        )}
      </WorkbenchPanel>
    </div>
  );
}
