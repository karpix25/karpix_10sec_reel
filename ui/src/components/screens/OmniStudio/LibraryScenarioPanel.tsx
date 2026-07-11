"use client";

import { CheckCircle2, Link2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  OmniLegacyLibrary,
  OmniLegacyScenario,
  OmniLegacyScenarioLink,
} from "@/lib/omni/types";
import { EmptyState, QueryState, WorkbenchPanel } from "./ui";

function scenarioTitle(scenario: OmniLegacyScenario) {
  return scenario.title || scenario.topic || scenario.script.slice(0, 90) || `Сценарий #${scenario.id}`;
}

export function LibraryScenarioPanel({
  libraries,
  scenarios,
  scenarioLinks,
  activeLibraryId,
  legacySearch,
  totalScenarios,
  isLibrariesLoading,
  isScenariosLoading,
  isLibrariesError,
  isScenariosError,
  isLinkingScenario,
  onSearchChange,
  onSelectLibrary,
  onLinkScenario,
}: {
  libraries: OmniLegacyLibrary[];
  scenarios: OmniLegacyScenario[];
  scenarioLinks: OmniLegacyScenarioLink[];
  activeLibraryId: number | null;
  legacySearch: string;
  totalScenarios: number;
  isLibrariesLoading: boolean;
  isScenariosLoading: boolean;
  isLibrariesError: boolean;
  isScenariosError: boolean;
  isLinkingScenario: boolean;
  onSearchChange: (value: string) => void;
  onSelectLibrary: (legacyClientId: number) => void;
  onLinkScenario: (legacyScenarioId: number) => void;
}) {
  const linkedScenarioIds = new Set(scenarioLinks.map((link) => link.legacy_scenario_id));

  return (
    <div className="space-y-4">
      <WorkbenchPanel
        title="Источник сценариев"
        description="Старые библиотеки читаются read-only. Библиотека нужна только как фильтр, сами сценарии активируются на уровне проекта."
      >
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={legacySearch}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Поиск библиотеки или сценария"
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
          {libraries.map((library) => {
            const isActive = activeLibraryId === library.client_id;
            return (
              <button
                key={library.client_id}
                type="button"
                onClick={() => onSelectLibrary(library.client_id)}
                className={`rounded-lg border p-3 transition ${
                  isActive ? "border-primary bg-primary/5" : "border-border bg-background"
                }`}
              >
                <div className="flex items-start justify-between gap-3 text-left">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{library.name}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {library.product_keyword || library.product_info || library.niche || "Legacy product library"}
                    </p>
                  </div>
                  <div className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                    {library.scenario_count}
                  </div>
                </div>
              </button>
            );
          })}
          {!libraries.length && !isLibrariesLoading && (
            <EmptyState
              title="Библиотеки не найдены"
              description="Попробуй другой поиск или проверь доступность старой БД."
            />
          )}
        </div>
      </WorkbenchPanel>

      <WorkbenchPanel
        title="Активация сценариев"
        description={
          activeLibraryId
            ? `${totalScenarios} сценариев в выбранной библиотеке`
            : "Выберите библиотеку-источник, чтобы увидеть сценарии для активации."
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
            title="Библиотека не выбрана"
            description="Сценарии будут отфильтрованы по выбранной legacy-библиотеке, но активируются на уровне текущего проекта."
          />
        ) : (
          <div className="grid max-h-[34rem] gap-2 overflow-auto pr-1">
            {scenarios.map((scenario) => {
              const isLinked = linkedScenarioIds.has(scenario.id);
              return (
                <div
                  key={scenario.id}
                  className={`min-h-24 rounded-lg border p-3 transition ${
                    isLinked ? "border-emerald-200 bg-emerald-50" : "border-border bg-background"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">{scenarioTitle(scenario)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {scenario.legacy_product_keyword || scenario.legacy_client_name || `Legacy #${scenario.client_id}`}
                      </p>
                      <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">{scenario.script}</p>
                    </div>
                    {isLinked ? (
                      <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <Link2 className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={isLinked ? "secondary" : "outline"}
                    onClick={() => onLinkScenario(scenario.id)}
                    disabled={isLinked || isLinkingScenario}
                    className="mt-3 min-h-9"
                  >
                    {isLinked ? "Активен" : "Активировать сценарий"}
                  </Button>
                </div>
              );
            })}
            {!scenarios.length && !isScenariosLoading && (
              <EmptyState title="Сценарии не найдены" description="В этой библиотеке нет сценариев под текущий поиск." />
            )}
          </div>
        )}
      </WorkbenchPanel>
    </div>
  );
}
