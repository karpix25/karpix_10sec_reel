"use client";

import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOmniProjects, useOmniStudio } from "@/hooks/useOmniStudio";
import {
  buildReadiness,
  findClientWorkspaceProject,
  getActiveProduct,
  getClientWorkspaceDescription,
  getEffectiveLegacyLibraryId,
  getLatestAvatar,
} from "@/lib/omni/workspace";
import { buildManualProductRefs } from "@/lib/omni/navigator";
import type { OmniProject } from "@/lib/omni/types";
import type { Client } from "@/types";
import { AvatarDraft, AvatarVideoPanel } from "./AvatarVideoPanel";
import { LibraryScenarioPanel } from "./LibraryScenarioPanel";
import { OmniOverviewTab } from "./OmniOverviewTab";
import { OmniPipelineHeader } from "./OmniPipelineHeader";
import { OmniProductTab, ProductDraft } from "./OmniProductTab";

const emptyAvatarDraft: AvatarDraft = {
  prompt: "",
  referenceUrl: "",
};

const emptyProductDraft: ProductDraft = {
  name: "",
  description: "",
  referenceUrl: "",
};

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
  const [legacySearch, setLegacySearch] = useState("");
  const [activeLibraryId, setActiveLibraryId] = useState<number | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<number | null>(null);
  const [avatarDraft, setAvatarDraft] = useState<AvatarDraft>(emptyAvatarDraft);
  const [productDraft, setProductDraft] = useState<ProductDraft>(emptyProductDraft);

  const projectsQuery = useOmniProjects();
  const allProjects = useMemo(() => projectsQuery.data || [], [projectsQuery.data]);
  const inferredProject = useMemo(
    () => findClientWorkspaceProject(allProjects, selectedClient),
    [allProjects, selectedClient]
  );
  const selectedProject = allProjects.find((project) => project.id === selectedProjectId) || null;
  const activeProject = selectedProject || inferredProject;
  const activeProjectId = activeProject?.id || null;
  const studio = useOmniStudio(activeProjectId, selectedProductId, legacySearch, activeLibraryId);
  const products = useMemo(() => studio.productsQuery.data || [], [studio.productsQuery.data]);
  const libraries = studio.legacyLibrariesQuery.data || [];
  const libraryLinks = studio.libraryLinksQuery.data || [];
  const scenarios = studio.legacyScenariosQuery.data?.data || [];
  const scenarioLinks = studio.scenarioLinksQuery.data || [];
  const avatars = studio.avatarsQuery.data || [];
  const reels = studio.reelsQuery.data?.reels || [];
  const segments = studio.reelsQuery.data?.segments || [];

  const activeProduct = useMemo(() => getActiveProduct(products, selectedProductId), [products, selectedProductId]);
  const effectiveLibraryId = getEffectiveLegacyLibraryId(activeLibraryId, libraryLinks);
  const latestAvatar = getLatestAvatar(avatars);
  const readiness = buildReadiness({
    activeProject,
    activeProduct,
    latestAvatar,
    activeLibraryId: effectiveLibraryId,
    selectedScenarioId,
    reels,
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
          setActiveLibraryId(null);
          setSelectedScenarioId(null);
        },
      }
    );
  };

  const ensureProject = async () => {
    if (activeProject) return activeProject;
    if (!selectedClient) return null;

    const project = await studio.createProjectMutation.mutateAsync({
      name: selectedClient.name,
      description: getClientWorkspaceDescription(selectedClient),
      targetAudience: selectedClient.target_audience || undefined,
      brandVoice: selectedClient.brand_voice || undefined,
      legacyClientId: selectedClient.id,
    });
    onSelectProject(project.id);
    return project;
  };

  const handleCreateProduct = async () => {
    const name = productDraft.name.trim();
    if (!name) return;

    const project = await ensureProject();
    if (!project) return;

    const product = await studio.createProductMutation.mutateAsync({
      projectId: project.id,
      name,
      description: productDraft.description.trim(),
      productReferenceNotes: productDraft.description.trim(),
      targetDurationSeconds: 30,
      productRefs: buildManualProductRefs(productDraft.referenceUrl),
    });
    onSelectProject(project.id);
    onSelectProduct(product.id);
    setActiveLibraryId(null);
    setSelectedScenarioId(null);
    setProductDraft(emptyProductDraft);
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
    studio.linkLibraryMutation.mutate({ projectId: activeProjectId, productId: selectedProductId, legacyClientId });
    setActiveLibraryId(legacyClientId);
  };

  const handleLinkScenario = (legacyScenarioId: number) => {
    if (!activeProjectId || !selectedProductId) return;
    studio.linkScenarioMutation.mutate({ projectId: activeProjectId, productId: selectedProductId, legacyScenarioId });
    setSelectedScenarioId(legacyScenarioId);
  };

  const handleCreateReel = () => {
    if (!activeProjectId || !selectedProductId) return;
    studio.createReelMutation.mutate({
      projectId: activeProjectId,
      productId: selectedProductId,
      sourceLegacyScenarioId: selectedScenarioId,
      targetDurationSeconds: activeProduct?.target_duration_seconds || 30,
      brief: activeProduct?.product_reference_notes || activeProduct?.description || "",
    });
  };

  return (
    <div className="mx-auto max-w-[94rem] space-y-5">
      <OmniPipelineHeader
        clientName={activeProject?.name || selectedClient?.name || "не выбран"}
        productName={activeProduct?.name || "не выбран"}
        libraryLabel={effectiveLibraryId ? `legacy #${effectiveLibraryId}` : "не выбрана"}
        readiness={readiness}
      />

      <Tabs defaultValue="overview" className="rounded-lg border border-border bg-card p-3">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-muted/60">
          <TabsTrigger value="overview" className="min-h-9 flex-none px-3">Управление</TabsTrigger>
          <TabsTrigger value="product" className="min-h-9 flex-none px-3">Продукт</TabsTrigger>
          <TabsTrigger value="library" className="min-h-9 flex-none px-3">Сценарии</TabsTrigger>
          <TabsTrigger value="generation" className="min-h-9 flex-none px-3">Аватар + генерация</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OmniOverviewTab
            activeProject={activeProject}
            activeProduct={activeProduct}
            selectedClient={selectedClient}
            readiness={readiness}
            isCreatingProject={studio.createProjectMutation.isPending}
            onCreateWorkspace={handleCreateWorkspace}
          />
        </TabsContent>

        <TabsContent value="product" className="mt-4">
          <OmniProductTab
            activeProject={activeProject}
            activeProduct={activeProduct}
            products={products}
            selectedProductId={selectedProductId}
            productDraft={productDraft}
            isProductsLoading={studio.productsQuery.isLoading}
            isCreatingProduct={studio.createProductMutation.isPending}
            canCreateProduct={Boolean(activeProject || selectedClient)}
            onSelectProduct={(productId: number | null) => {
              onSelectProduct(productId);
              setActiveLibraryId(null);
              setSelectedScenarioId(null);
            }}
            onProductDraftChange={setProductDraft}
            onCreateProduct={() => void handleCreateProduct()}
          />
        </TabsContent>

        <TabsContent value="library" className="mt-4">
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
        </TabsContent>

        <TabsContent value="generation" className="mt-4">
          <AvatarVideoPanel
            activeProject={activeProject}
            activeProduct={activeProduct}
            selectedScenarioId={selectedScenarioId}
            avatars={avatars}
            latestAvatar={latestAvatar}
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
