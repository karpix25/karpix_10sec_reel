"use client";

import { useMemo, useState } from "react";
import { Database, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useOmniProjects, useOmniStudio } from "@/hooks/useOmniStudio";
import type { OmniProduct, OmniProject } from "@/lib/omni/types";
import type { Client } from "@/types";
import { AvatarDraft, AvatarVideoPanel } from "./AvatarVideoPanel";
import { ClientProductPanel, ProductDraft } from "./ClientProductPanel";
import { LibraryScenarioPanel } from "./LibraryScenarioPanel";

const emptyProductDraft: ProductDraft = {
  name: "",
  description: "",
  productReferenceUrl: "",
  avatarReferenceNotes: "",
  targetDurationSeconds: 30,
};

const emptyAvatarDraft: AvatarDraft = {
  prompt: "",
  referenceUrl: "",
};

function clientWorkspaceDescription(client: Client) {
  return `legacy-client:${client.id}`;
}

export function OmniStudioScreen({ selectedClient }: { selectedClient: Client | null }) {
  const [projectId, setProjectId] = useState<number | null>(null);
  const [productId, setProductId] = useState<number | null>(null);
  const [legacySearch, setLegacySearch] = useState("");
  const [activeLibraryId, setActiveLibraryId] = useState<number | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<number | null>(null);
  const [productDraft, setProductDraft] = useState<ProductDraft>(emptyProductDraft);
  const [avatarDraft, setAvatarDraft] = useState<AvatarDraft>(emptyAvatarDraft);

  const projectsQuery = useOmniProjects();
  const allProjects = useMemo(() => projectsQuery.data || [], [projectsQuery.data]);
  const inferredProject = useMemo(() => {
    if (!selectedClient) return null;
    return (
      allProjects.find(
        (project) =>
          project.description === clientWorkspaceDescription(selectedClient) || project.name === selectedClient.name
      ) || null
    );
  }, [allProjects, selectedClient]);
  const selectedProject = allProjects.find((project) => project.id === projectId) || null;
  const activeProject = selectedProject || inferredProject;
  const activeProjectId = activeProject?.id || null;
  const studio = useOmniStudio(activeProjectId, productId, legacySearch, activeLibraryId);
  const projects = allProjects;
  const products = useMemo(() => studio.productsQuery.data || [], [studio.productsQuery.data]);
  const libraries = studio.legacyLibrariesQuery.data || [];
  const libraryLinks = studio.libraryLinksQuery.data || [];
  const scenarios = studio.legacyScenariosQuery.data?.data || [];
  const scenarioLinks = studio.scenarioLinksQuery.data || [];
  const avatars = studio.avatarsQuery.data || [];
  const reels = studio.reelsQuery.data?.reels || [];
  const segments = studio.reelsQuery.data?.segments || [];

  const activeProduct = useMemo(
    () => products.find((product) => product.id === productId) || null,
    [products, productId]
  );
  const effectiveLibraryId = activeLibraryId || Number(libraryLinks[0]?.legacy_client_id || 0) || null;

  const handleCreateWorkspace = () => {
    if (!selectedClient) return;
    studio.createProjectMutation.mutate(
      {
        name: selectedClient.name,
        description: clientWorkspaceDescription(selectedClient),
      },
      {
        onSuccess: (project: OmniProject) => {
          setProjectId(project.id);
          setProductId(null);
          setActiveLibraryId(null);
          setSelectedScenarioId(null);
        },
      }
    );
  };

  const handleCreateProduct = () => {
    if (!activeProjectId || !productDraft.name.trim()) return;
    const refs = productDraft.productReferenceUrl.trim()
      ? [
          {
            id: productDraft.productReferenceUrl.trim(),
            url: productDraft.productReferenceUrl.trim(),
            kind: "image",
            label: "product reference",
          },
        ]
      : [];

    studio.createProductMutation.mutate(
      {
        projectId: activeProjectId,
        name: productDraft.name.trim(),
        description: productDraft.description.trim(),
        productReferenceNotes: productDraft.description.trim(),
        avatarReferenceNotes: productDraft.avatarReferenceNotes.trim(),
        targetDurationSeconds: productDraft.targetDurationSeconds,
        productRefs: refs,
      },
      {
        onSuccess: (product: OmniProduct) => {
          setProductId(product.id);
          setProductDraft(emptyProductDraft);
        },
      }
    );
  };

  const handleCreateAvatar = () => {
    if (!activeProjectId || !avatarDraft.prompt.trim()) return;
    studio.createAvatarMutation.mutate(
      {
        projectId: activeProjectId,
        prompt: avatarDraft.prompt.trim(),
        referenceUrl: avatarDraft.referenceUrl.trim(),
      },
      {
        onSuccess: () => setAvatarDraft(emptyAvatarDraft),
      }
    );
  };

  const handleActivateLibrary = (legacyClientId: number) => {
    if (!activeProjectId) return;
    studio.linkLibraryMutation.mutate({ projectId: activeProjectId, productId, legacyClientId });
    setActiveLibraryId(legacyClientId);
  };

  const handleLinkScenario = (legacyScenarioId: number) => {
    if (!activeProjectId || !productId) return;
    studio.linkScenarioMutation.mutate({ projectId: activeProjectId, productId, legacyScenarioId });
    setSelectedScenarioId(legacyScenarioId);
  };

  const handleCreateReel = () => {
    if (!activeProjectId || !productId) return;
    studio.createReelMutation.mutate({
      projectId: activeProjectId,
      productId,
      sourceLegacyScenarioId: selectedScenarioId,
      targetDurationSeconds: activeProduct?.target_duration_seconds || productDraft.targetDurationSeconds,
      brief: activeProduct?.product_reference_notes || activeProduct?.description || "",
    });
  };

  return (
    <div className="mx-auto max-w-[94rem] space-y-5">
      <header className="rounded-lg border border-border bg-card px-4 py-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <Sparkles className="h-3.5 w-3.5" />
                Omni Reels
              </Badge>
              <Badge variant="outline" className="gap-1">
                <Database className="h-3.5 w-3.5" />
                old DB read-only
              </Badge>
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Клиенты, продукты, сценарии, видео
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Рабочая панель для клиента: создаем продукты, сохраняем refs, подключаем продуктовые библиотеки сценариев и
              готовим 10-секундные сегменты для Omni через KIE.
            </p>
          </div>
          <div className="grid gap-1 text-left text-xs text-muted-foreground xl:text-right">
            <span>Клиент: {selectedClient?.name || "не выбран"}</span>
            <span>Продукт: {activeProduct?.name || "не выбран"}</span>
            <span>Библиотека: {effectiveLibraryId ? `legacy #${effectiveLibraryId}` : "не выбрана"}</span>
          </div>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)_24rem]">
        <ClientProductPanel
          selectedClient={selectedClient}
          projects={projects}
          products={products}
          activeProject={activeProject}
          activeProductId={productId}
          productDraft={productDraft}
          isProjectsLoading={projectsQuery.isLoading}
          isProductsLoading={studio.productsQuery.isLoading}
          isCreatingProject={studio.createProjectMutation.isPending}
          isCreatingProduct={studio.createProductMutation.isPending}
          onCreateWorkspace={handleCreateWorkspace}
          onSelectProject={(id) => {
            setProjectId(id);
            setProductId(null);
            setActiveLibraryId(null);
            setSelectedScenarioId(null);
          }}
          onSelectProduct={(id) => {
            setProductId(id);
            setActiveLibraryId(null);
            setSelectedScenarioId(null);
          }}
          onProductDraftChange={setProductDraft}
          onCreateProduct={handleCreateProduct}
        />

        <LibraryScenarioPanel
          activeProduct={activeProduct}
          libraries={libraries}
          libraryLinks={libraryLinks}
          scenarios={scenarios}
          scenarioLinks={scenarioLinks}
          activeLibraryId={effectiveLibraryId}
          selectedScenarioId={selectedScenarioId}
          legacySearch={legacySearch}
          totalScenarios={studio.legacyScenariosQuery.data?.totalCount || 0}
          isLibrariesLoading={studio.legacyLibrariesQuery.isLoading}
          isScenariosLoading={studio.legacyScenariosQuery.isLoading}
          isLibrariesError={studio.legacyLibrariesQuery.isError}
          isScenariosError={studio.legacyScenariosQuery.isError}
          isLinkingLibrary={studio.linkLibraryMutation.isPending}
          isLinkingScenario={studio.linkScenarioMutation.isPending}
          onSearchChange={setLegacySearch}
          onSelectLibrary={(legacyClientId) => {
            setActiveLibraryId(legacyClientId);
            setSelectedScenarioId(null);
          }}
          onActivateLibrary={handleActivateLibrary}
          onLinkScenario={handleLinkScenario}
        />

        <AvatarVideoPanel
          activeProject={activeProject}
          activeProduct={activeProduct}
          selectedScenarioId={selectedScenarioId}
          avatars={avatars}
          avatarDraft={avatarDraft}
          reels={reels}
          segments={segments}
          isAvatarsLoading={studio.avatarsQuery.isLoading}
          isReelsLoading={studio.reelsQuery.isLoading}
          isCreatingAvatar={studio.createAvatarMutation.isPending}
          isCreatingReel={studio.createReelMutation.isPending}
          onAvatarDraftChange={setAvatarDraft}
          onCreateAvatar={handleCreateAvatar}
          onCreateReel={handleCreateReel}
        />
      </div>
    </div>
  );
}
