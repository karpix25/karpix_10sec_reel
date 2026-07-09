"use client";

import { useMemo, useState } from "react";
import { useOmniProjects, useOmniStudio } from "@/hooks/useOmniStudio";
import {
  buildReadiness,
  findClientWorkspaceProject,
  getActiveProduct,
  getClientWorkspaceDescription,
  getEffectiveLegacyLibraryId,
  getLatestAvatar,
} from "@/lib/omni/workspace";
import type { OmniProduct, OmniProject } from "@/lib/omni/types";
import type { Client } from "@/types";
import { AvatarDraft, AvatarVideoPanel } from "./AvatarVideoPanel";
import { ClientProductPanel, ProductDraft } from "./ClientProductPanel";
import { LibraryScenarioPanel } from "./LibraryScenarioPanel";
import { OmniPipelineHeader } from "./OmniPipelineHeader";

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
  const inferredProject = useMemo(
    () => findClientWorkspaceProject(allProjects, selectedClient),
    [allProjects, selectedClient]
  );
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

  const activeProduct = useMemo(() => getActiveProduct(products, productId), [products, productId]);
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
        legacyClientId: selectedClient.id,
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
            role: "product_primary",
            label: "product reference",
            storage_provider: "manual",
            status: "manual_url",
            is_primary: true,
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
      <OmniPipelineHeader
        clientName={selectedClient?.name || "не выбран"}
        productName={activeProduct?.name || "не выбран"}
        libraryLabel={effectiveLibraryId ? `legacy #${effectiveLibraryId}` : "не выбрана"}
        readiness={readiness}
      />

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
      </div>
    </div>
  );
}
