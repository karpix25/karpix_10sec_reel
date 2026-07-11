"use client";

import { Archive, CheckCircle2, FileText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  OmniLegacyLibrary,
  OmniLegacyLibraryLink,
  OmniLegacyScenario,
} from "@/lib/omni/types";
import { EmptyState, QueryState, WorkbenchPanel } from "./ui";

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
  activeLibraryId,
  legacySearch,
  totalScenarios,
  isLibrariesLoading,
  isScenariosLoading,
  isLibrariesError,
  isScenariosError,
  isActivatingBundle,
  isDeactivatingBundle,
  onSearchChange,
  onSelectLibrary,
  onActivateBundle,
  onDeactivateBundle,
}: {
  libraries: OmniLegacyLibrary[];
  libraryLinks: OmniLegacyLibraryLink[];
  scenarios: OmniLegacyScenario[];
  activeLibraryId: number | null;
  legacySearch: string;
  totalScenarios: number;
  isLibrariesLoading: boolean;
  isScenariosLoading: boolean;
  isLibrariesError: boolean;
  isScenariosError: boolean;
  isActivatingBundle: boolean;
  isDeactivatingBundle: boolean;
  onSearchChange: (value: string) => void;
  onSelectLibrary: (legacyClientId: number) => void;
  onActivateBundle: (legacyClientId: number) => void;
  onDeactivateBundle: (legacyClientId: number) => void;
}) {
  const activeBundleIds = new Set(libraryLinks.map((link) => link.legacy_client_id));
  const selectedBundle = libraries.find((library) => library.client_id === activeLibraryId) || null;
  const activeLibraries = libraries.filter((library) => activeBundleIds.has(library.client_id));
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
                      {library.scenario_count} скриптов
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
                      {library.scenario_count} скриптов
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
        title="Оригинальные скрипты в бандле"
        description={
          selectedBundle
            ? `${totalScenarios} оригинальных скриптов в бандле «${selectedBundle.name}»`
            : "Выберите бандл, чтобы увидеть оригинальные скрипты внутри него."
        }
      >
        <QueryState
          isLoading={isScenariosLoading}
          isError={isScenariosError}
          loadingText="Загружаю сценарии"
          errorText="Не удалось загрузить сценарии"
        />
        {!activeLibraryId ? (
          <EmptyState
            title="Бандл не выбран"
            description="Сначала выберите старый проект/продукт слева. Затем можно активировать бандл целиком для текущего проекта."
          />
        ) : (
          <div className="grid max-h-[34rem] gap-2 overflow-auto pr-1">
            {scenarios.map((scenario) => {
              return (
                <div
                  key={scenario.id}
                  className="min-h-24 rounded-lg border border-border bg-background p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">
                        {getScriptHook(scenario.script)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Оригинальный скрипт
                      </p>
                      <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">{scenario.script}</p>
                    </div>
                    <FileText className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>
                </div>
              );
            })}
            {!scenarios.length && !isScenariosLoading && (
              <EmptyState title="Скрипты не найдены" description="В этом бандле нет оригинальных скриптов под текущий поиск." />
            )}
          </div>
        )}
      </WorkbenchPanel>
    </div>
  );
}
