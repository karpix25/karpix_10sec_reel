"use client";

import { Link2, Library, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  OmniLegacyLibrary,
  OmniLegacyLibraryLink,
  OmniLegacyScenario,
  OmniLegacyScenarioLink,
  OmniProduct,
} from "@/lib/omni/types";
import { EmptyState, QueryState, WorkbenchPanel } from "./ui";

function scenarioTitle(scenario: OmniLegacyScenario) {
  return scenario.title || scenario.topic || scenario.script.slice(0, 90) || `Сценарий #${scenario.id}`;
}

export function LibraryScenarioPanel({
  activeProduct,
  libraries,
  libraryLinks,
  scenarios,
  scenarioLinks,
  activeLibraryId,
  selectedScenarioId,
  legacySearch,
  totalScenarios,
  isLibrariesLoading,
  isScenariosLoading,
  isLibrariesError,
  isScenariosError,
  isLinkingLibrary,
  isLinkingScenario,
  onSearchChange,
  onSelectLibrary,
  onActivateLibrary,
  onLinkScenario,
}: {
  activeProduct: OmniProduct | null;
  libraries: OmniLegacyLibrary[];
  libraryLinks: OmniLegacyLibraryLink[];
  scenarios: OmniLegacyScenario[];
  scenarioLinks: OmniLegacyScenarioLink[];
  activeLibraryId: number | null;
  selectedScenarioId: number | null;
  legacySearch: string;
  totalScenarios: number;
  isLibrariesLoading: boolean;
  isScenariosLoading: boolean;
  isLibrariesError: boolean;
  isScenariosError: boolean;
  isLinkingLibrary: boolean;
  isLinkingScenario: boolean;
  onSearchChange: (value: string) => void;
  onSelectLibrary: (legacyClientId: number) => void;
  onActivateLibrary: (legacyClientId: number) => void;
  onLinkScenario: (legacyScenarioId: number) => void;
}) {
  const activeLinkIds = new Set(libraryLinks.map((link) => link.legacy_client_id));
  const linkedScenarioIds = new Set(
    scenarioLinks
      .filter((link) => !activeProduct || link.product_id === activeProduct.id)
      .map((link) => link.legacy_scenario_id)
  );

  return (
    <div className="space-y-4">
      <WorkbenchPanel
        title="Библиотеки сценариев"
        description="Старые продуктовые библиотеки читаются read-only. Подключаем конкретную библиотеку к текущему продукту."
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
            const isLinked = activeLinkIds.has(library.client_id);
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
                <Button
                  size="sm"
                  variant={isLinked ? "secondary" : "outline"}
                  onClick={() => onActivateLibrary(library.client_id)}
                  disabled={!activeProduct || isLinked || isLinkingLibrary}
                  className="mt-3 min-h-9 whitespace-nowrap"
                >
                  <Library className="h-4 w-4" />
                  {isLinked ? "Активна" : "Активировать"}
                </Button>
              </div>
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
        title="Сценарии продукта"
        description={
          activeLibraryId
            ? `${totalScenarios} сценариев в выбранной библиотеке`
            : "Выбери legacy-библиотеку, чтобы увидеть сценарии этого продукта."
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
            description="Сценарии будут отфильтрованы по продуктовой библиотеке, чтобы не смешивать разные продукты клиента."
          />
        ) : (
          <div className="grid max-h-[34rem] gap-2 overflow-auto pr-1">
            {scenarios.map((scenario) => {
              const isLinked = linkedScenarioIds.has(scenario.id);
              const isSelected = selectedScenarioId === scenario.id;
              return (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => onLinkScenario(scenario.id)}
                  disabled={isLinkingScenario}
                  className={`min-h-24 rounded-lg border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : isLinked
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-border bg-background hover:bg-muted/40"
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
                    <Link2 className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>
                </button>
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
