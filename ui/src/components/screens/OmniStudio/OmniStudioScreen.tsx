"use client";

import { useMemo, useState } from "react";
import { Archive, Bot, Database, LayoutDashboard, Package, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useOmniProjects, useOmniStudio, useUploadOmniAvatarReference, useUploadOmniProductImages } from "@/hooks/useOmniStudio";
import {
  buildReadiness,
  findClientWorkspaceProject,
  getActiveProduct,
  getClientWorkspaceDescription,
  getEffectiveLegacyLibraryId,
  getLatestAvatar,
} from "@/lib/omni/workspace";
import type { OmniProject } from "@/lib/omni/types";
import type { Client } from "@/types";
import { AvatarVideoPanel, type AvatarDraft } from "./AvatarVideoPanel";
import { LibraryScenarioPanel } from "./LibraryScenarioPanel";
import { OmniOverviewTab } from "./OmniOverviewTab";
import { OmniProductTab, type ProductDraft } from "./OmniProductTab";
import { EmptyState } from "./ui";

type OmniStudioTab = "overview" | "product" | "avatar" | "library";

const OMNI_STUDIO_TABS: Array<{
  id: OmniStudioTab;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "overview", label: "Обзор", icon: LayoutDashboard },
  { id: "product", label: "Продукт", icon: Package },
  { id: "avatar", label: "Аватар", icon: Bot },
  { id: "library", label: "Библиотека", icon: Archive },
];

export function OmniStudioScreen({
  selectedClient,
  selectedProjectId,
  selectedProductId,
  onSelectProject,
  onSelectProduct,
}: {
  selectedClient: Client | null;
  selectedProjectId: number | null;
  selectedProductId: number | null;
  onSelectProject: (projectId: number | null) => void;
  onSelectProduct: (productId: number | null) => void;
}) {
  const [activeTab, setActiveTab] = useState<OmniStudioTab>("overview");
  const [legacySearch, setLegacySearch] = useState("");
  const [productDraft, setProductDraft] = useState<ProductDraft>({
    name: "",
    description: "",
    productRefs: [],
  });
  const [avatarDraft, setAvatarDraft] = useState<AvatarDraft>({
    prompt: "",
    referenceUrl: "",
  });
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
  const uploadProductImagesMutation = useUploadOmniProductImages();
  const uploadAvatarReferenceMutation = useUploadOmniAvatarReference();
  const libraries = studio.legacyLibrariesQuery.data || [];
  const scenarios = studio.legacyScenariosQuery.data?.data || [];
  const libraryLinks = studio.libraryLinksQuery.data || [];
  const products = studio.productsQuery.data || [];
  const avatars = studio.avatarsQuery.data || [];
  const reelsPayload = studio.reelsQuery.data || { reels: [], segments: [] };
  const activeProduct = getActiveProduct(products, selectedProductId);
  const latestAvatar = getLatestAvatar(avatars);
  const effectiveLibraryId = getEffectiveLegacyLibraryId(activeLibraryId, libraryLinks);
  const readiness = buildReadiness({
    activeProject,
    activeProduct,
    latestAvatar,
    activeLibraryId: effectiveLibraryId,
    selectedScenarioId,
    reels: reelsPayload.reels,
  });

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

  const handleUploadProductImages = async (files: FileList | null) => {
    if (!activeProjectId || !files?.length) return;
    const result = await uploadProductImagesMutation.mutateAsync({
      projectId: activeProjectId,
      files: Array.from(files),
    });
    setProductDraft((draft) => ({ ...draft, productRefs: [...draft.productRefs, ...result.refs] }));
  };

  const handleCreateProduct = () => {
    if (!activeProjectId) return;
    studio.createProductMutation.mutate(
      {
        projectId: activeProjectId,
        name: productDraft.name,
        description: productDraft.description,
        productRefs: productDraft.productRefs,
      },
      {
        onSuccess: (product) => {
          onSelectProduct(product.id);
          setProductDraft({ name: "", description: "", productRefs: [] });
        },
      }
    );
  };

  const handleUploadAvatarReference = async (file: File | null) => {
    if (!activeProjectId || !file) return;
    const result = await uploadAvatarReferenceMutation.mutateAsync({ projectId: activeProjectId, file });
    setAvatarDraft((draft) => ({ ...draft, referenceUrl: result.ref.url }));
  };

  const handleCreateAvatar = () => {
    if (!activeProjectId) return;
    studio.createAvatarMutation.mutate(
      {
        projectId: activeProjectId,
        prompt: avatarDraft.prompt,
        referenceUrl: avatarDraft.referenceUrl || undefined,
      },
      {
        onSuccess: () => setAvatarDraft({ prompt: "", referenceUrl: "" }),
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
    studio.runReelMutation.mutate({ projectId: activeProjectId, reelId });
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

      <nav aria-label="Omni Studio tabs" className="flex gap-2 overflow-x-auto rounded-lg border border-border bg-muted/70 p-1">
        {OMNI_STUDIO_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-current={isActive ? "page" : undefined}
              className={`flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                isActive ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:bg-card/70 hover:text-foreground"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {!libraries.length && studio.legacyLibrariesQuery.isError ? (
        <EmptyState title="Legacy DB недоступна" description="Проверьте подключение к старой базе сценариев." />
      ) : null}

      {activeTab === "overview" ? (
        <OmniOverviewTab
          activeProject={activeProject}
          activeProduct={activeProduct}
          selectedClient={selectedClient}
          readiness={readiness}
          isCreatingProject={studio.createProjectMutation.isPending}
          onCreateWorkspace={handleCreateWorkspace}
        />
      ) : null}

      {activeTab === "product" ? (
        <OmniProductTab
          activeProject={activeProject}
          activeProduct={activeProduct}
          products={products}
          selectedProductId={selectedProductId}
          productDraft={productDraft}
          isProductsLoading={studio.productsQuery.isLoading}
          isCreatingProduct={studio.createProductMutation.isPending}
          isUploadingProductImages={uploadProductImagesMutation.isPending}
          canCreateProduct={Boolean(activeProjectId)}
          onSelectProduct={onSelectProduct}
          onProductDraftChange={setProductDraft}
          onUploadProductImages={(files) => void handleUploadProductImages(files)}
          onCreateProduct={handleCreateProduct}
        />
      ) : null}

      {activeTab === "avatar" ? (
        <AvatarVideoPanel
          activeProject={activeProject}
          activeProduct={activeProduct}
          selectedScenarioId={selectedScenarioId}
          avatars={avatars}
          latestAvatar={latestAvatar}
          avatarDraft={avatarDraft}
          reels={reelsPayload.reels}
          segments={reelsPayload.segments}
          isAvatarsLoading={studio.avatarsQuery.isLoading}
          isReelsLoading={studio.reelsQuery.isLoading}
          isCreatingAvatar={studio.createAvatarMutation.isPending}
          isUploadingAvatarReference={uploadAvatarReferenceMutation.isPending}
          isCreatingReel={studio.createReelMutation.isPending}
          isRunningReel={studio.runReelMutation.isPending}
          isSyncingReel={studio.syncReelMutation.isPending}
          onAvatarDraftChange={setAvatarDraft}
          onUploadAvatarReference={(file) => void handleUploadAvatarReference(file)}
          onCreateAvatar={handleCreateAvatar}
          onCreateReel={() => handleCreateReel()}
          onRunReel={handleRunReel}
          onSyncReel={handleSyncReel}
        />
      ) : null}

      {activeTab === "library" ? (
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
      ) : null}
    </div>
  );
}
