"use client";

import { useMemo, useState } from "react";
import { Archive, Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useOmniProjects, useOmniStudio } from "@/hooks/useOmniStudio";
import {
  findClientWorkspaceProject,
  getActiveProduct,
  getClientWorkspaceDescription,
  getLatestAvatar,
} from "@/lib/omni/workspace";
import type { OmniProject } from "@/lib/omni/types";
import type { Client } from "@/types";
import { LibraryScenarioPanel } from "./LibraryScenarioPanel";
import { EmptyState } from "./ui";
import type { OmniGenerationProvider } from "@/lib/omni/provider";

export function OmniStudioScreen({
  selectedClient,
  selectedProjectId,
  selectedProductId,
  onSelectProject,
  onSelectProduct,
  omniGenerationProvider,
}: {
  selectedClient: Client | null;
  selectedProjectId: number | null;
  selectedProductId: number | null;
  onSelectProject: (projectId: number | null) => void;
  onSelectProduct: (productId: number | null) => void;
  omniGenerationProvider: OmniGenerationProvider;
}) {
  const [legacySearch, setLegacySearch] = useState("");
  const [selectedScenarioId, setSelectedScenarioId] = useState<number | null>(null);
  const [activeLibrarySelection, setActiveLibrarySelection] = useState<{
    projectId: number | null;
    libraryId: number | null;
  }>({ projectId: null, libraryId: null });

  const projectsQuery = useOmniProjects();
  const allProjects = useMemo(() => projectsQuery.data || [], [projectsQuery.data]);
  const inferredProject = useMemo(
    () => findClientWorkspaceProject(allProjects, selectedClient),
    [allProjects, selectedClient]
  );
  const selectedProject = allProjects.find((project) => project.id === selectedProjectId) || null;
  const activeProject = selectedProject || inferredProject;
  const activeProjectId = activeProject?.id || null;
  const activeLibraryId =
    activeLibrarySelection.projectId === activeProjectId ? activeLibrarySelection.libraryId : null;
  const studio = useOmniStudio(activeProjectId, selectedProductId, legacySearch, activeLibraryId);
  const libraries = studio.legacyLibrariesQuery.data || [];
  const scenarios = studio.legacyScenariosQuery.data?.data || [];
  const libraryLinks = studio.libraryLinksQuery.data || [];
  const products = studio.productsQuery.data || [];
  const avatars = studio.avatarsQuery.data || [];
  const reelsPayload = studio.reelsQuery.data || { reels: [], segments: [] };
  const activeProduct = getActiveProduct(products, selectedProductId);
  const latestAvatar = getLatestAvatar(avatars);

  const handleCreateWorkspace = () => {
    if (!selectedClient) return;
    studio.createProjectMutation.mutate(
      {
        name: selectedClient.name,
        description: getClientWorkspaceDescription(selectedClient),
        targetAudience: selectedClient.target_audience || undefined,
        brandVoice: selectedClient.brand_voice || undefined,
        legacyClientId: selectedClient.id,
      },
      {
        onSuccess: (project: OmniProject) => {
          onSelectProject(project.id);
          onSelectProduct(null);
          setActiveLibrarySelection({ projectId: project.id, libraryId: null });
        },
      }
    );
  };

  const handleCreateReel = (scenarioId = selectedScenarioId) => {
    if (!activeProjectId || !selectedProductId || !scenarioId) return;
    studio.createReelMutation.mutate({
      projectId: activeProjectId,
      productId: selectedProductId,
      sourceLegacyScenarioId: scenarioId,
      targetDurationSeconds: activeProduct?.target_duration_seconds || 30,
      autoRun: true,
    });
  };

  const handleCreateScenarioVideo = (scenarioId: number) => {
    setSelectedScenarioId(scenarioId);
    handleCreateReel(scenarioId);
  };

  const handleRunReel = (reelId: number) => {
    if (!activeProjectId) return;
    studio.runReelMutation.mutate({ projectId: activeProjectId, reelId, provider: omniGenerationProvider });
  };

  const handleSyncReel = (reelId: number) => {
    if (!activeProjectId) return;
    studio.syncReelMutation.mutate({ projectId: activeProjectId, reelId });
  };

  const handleSelectLibrary = (legacyClientId: number) => {
    if (!activeProjectId) return;
    setActiveLibrarySelection({ projectId: activeProjectId, libraryId: legacyClientId });
  };

  const handleActivateBundle = (legacyClientId: number) => {
    if (!activeProjectId) return;
    studio.linkLibraryMutation.mutate({ projectId: activeProjectId, legacyClientId });
  };

  const handleDeactivateBundle = (legacyClientId: number) => {
    if (!activeProjectId) return;
    studio.unlinkLibraryMutation.mutate({ projectId: activeProjectId, legacyClientId });
  };

  if (!activeProject) {
    return (
      <div className="mx-auto max-w-[94rem] rounded-lg border border-border bg-card p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Библиотека сценариев</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Выберите бренд слева</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          После выбора бренда здесь можно активировать legacy-бандлы, которые будут доступны production-пайплайну проекта.
        </p>
        {selectedClient ? (
          <div className="mt-4">
            <button
              type="button"
              onClick={handleCreateWorkspace}
              disabled={studio.createProjectMutation.isPending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {studio.createProjectMutation.isPending ? "Создаю..." : "Создать проект бренда"}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  const activatedBundleCount = new Set(libraryLinks.map((link) => link.legacy_client_id)).size;

  return (
    <div className="mx-auto max-w-[94rem] space-y-5">
      <header className="rounded-lg border border-border bg-card p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <Archive className="h-3.5 w-3.5" />
            project-level бандлы
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Database className="h-3.5 w-3.5" />
            legacy DB read-only
          </Badge>
        </div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Библиотека сценариев</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              Активация legacy-бандлов для {activeProject.name}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Каждый бандл соответствует старому проекту/продукту и содержит оригинальные транскрибации reference-видео.
              Активируйте один или несколько бандлов для текущего проекта.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/35 px-4 py-3 text-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Активно</div>
            <div className="mt-1 text-2xl font-semibold text-foreground">{activatedBundleCount}</div>
          </div>
        </div>
      </header>

      {!libraries.length && studio.legacyLibrariesQuery.isError ? (
        <EmptyState title="Legacy DB недоступна" description="Проверьте подключение к старой базе сценариев." />
      ) : null}

      <LibraryScenarioPanel
        libraries={libraries}
        libraryLinks={libraryLinks}
        scenarios={scenarios}
        activeProduct={activeProduct}
        latestAvatar={latestAvatar}
        reels={reelsPayload.reels}
        segments={reelsPayload.segments}
        activeLibraryId={activeLibraryId}
        selectedScenarioId={selectedScenarioId}
        legacySearch={legacySearch}
        totalScenarios={studio.legacyScenariosQuery.data?.totalCount || 0}
        isLibrariesLoading={studio.legacyLibrariesQuery.isLoading}
        isScenariosLoading={studio.legacyScenariosQuery.isLoading}
        isLibrariesError={studio.legacyLibrariesQuery.isError}
        isScenariosError={studio.legacyScenariosQuery.isError}
        isActivatingBundle={studio.linkLibraryMutation.isPending}
        isDeactivatingBundle={studio.unlinkLibraryMutation.isPending}
        isCreatingReel={studio.createReelMutation.isPending}
        isRunningReel={studio.runReelMutation.isPending}
        isSyncingReel={studio.syncReelMutation.isPending}
        onSearchChange={setLegacySearch}
        onSelectLibrary={handleSelectLibrary}
        onActivateBundle={handleActivateBundle}
        onDeactivateBundle={handleDeactivateBundle}
        onSelectScenario={setSelectedScenarioId}
        onCreateScenarioVideo={handleCreateScenarioVideo}
        onRunReel={handleRunReel}
        onSyncReel={handleSyncReel}
      />
    </div>
  );
}
