"use client";

import { useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, FolderPlus, Package, PackagePlus, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useCreateOmniProduct,
  useCreateOmniProject,
  useOmniProducts,
  useOmniProjects,
} from "@/hooks/useOmniStudio";
import { buildManualProductRefs, resolveProjectLabel } from "@/lib/omni/navigator";
import { findClientWorkspaceProject, getClientWorkspaceDescription } from "@/lib/omni/workspace";
import type { OmniProduct } from "@/lib/omni/types";
import type { Client } from "@/types";

type NavigatorProps = {
  clients: Client[];
  selectedClient: Client | null;
  selectedClientId: string;
  selectedProjectId: number | null;
  selectedProductId: number | null;
  isLoadingClients: boolean;
  onSelectClientId: (id: string) => void;
  onSelectProjectId: (id: number | null) => void;
  onSelectProductId: (id: number | null) => void;
  onOpenOmni: () => void;
};

const emptyClientDraft = { name: "", description: "" };
const emptyProductDraft = { name: "", description: "", referenceUrl: "", duration: 30 };

export function ClientProductNavigator({
  clients,
  selectedClient,
  selectedClientId,
  selectedProjectId,
  selectedProductId,
  isLoadingClients,
  onSelectClientId,
  onSelectProjectId,
  onSelectProductId,
  onOpenOmni,
}: NavigatorProps) {
  const [clientDraft, setClientDraft] = useState(emptyClientDraft);
  const [productDraft, setProductDraft] = useState(emptyProductDraft);
  const projectsQuery = useOmniProjects();
  const createProjectMutation = useCreateOmniProject();
  const createProductMutation = useCreateOmniProduct();
  const projects = useMemo(() => projectsQuery.data || [], [projectsQuery.data]);
  const selectedProject = projects.find((project) => project.id === selectedProjectId) || null;
  const inferredProject = useMemo(
    () => findClientWorkspaceProject(projects, selectedClient),
    [projects, selectedClient]
  );
  const activeProject = selectedProject || inferredProject;
  const activeProjectId = activeProject?.id || null;
  const productsQuery = useOmniProducts(activeProjectId);
  const products = useMemo(() => productsQuery.data || [], [productsQuery.data]);
  const selectedProduct = products.find((product) => product.id === selectedProductId) || null;
  const clientSelectValue = selectedProjectId
    ? `project:${selectedProjectId}`
    : selectedClientId
      ? `legacy:${selectedClientId}`
      : "";

  useEffect(() => {
    if (!selectedProductId) return;
    if (productsQuery.isLoading) return;
    if (!products.some((product) => product.id === selectedProductId)) {
      onSelectProductId(null);
    }
  }, [onSelectProductId, products, productsQuery.isLoading, selectedProductId]);

  const handleSelectClient = (value: string) => {
    onSelectProductId(null);
    onOpenOmni();

    if (value.startsWith("project:")) {
      const projectId = Number(value.replace("project:", ""));
      const project = projects.find((item) => item.id === projectId) || null;
      onSelectProjectId(projectId);
      onSelectClientId(project?.legacy_client_id ? String(project.legacy_client_id) : "");
      return;
    }

    const legacyClientId = value.replace("legacy:", "");
    onSelectProjectId(null);
    onSelectClientId(legacyClientId);
  };

  const handleCreateClient = async () => {
    const name = clientDraft.name.trim();
    if (!name) return;

    const project = await createProjectMutation.mutateAsync({
      name,
      description: clientDraft.description.trim() || null || undefined,
    });
    onSelectClientId("");
    onSelectProjectId(project.id);
    onSelectProductId(null);
    setClientDraft(emptyClientDraft);
    onOpenOmni();
  };

  const ensureProject = async () => {
    if (activeProject) return activeProject;
    if (!selectedClient) return null;

    const project = await createProjectMutation.mutateAsync({
      name: selectedClient.name,
      description: getClientWorkspaceDescription(selectedClient),
      legacyClientId: selectedClient.id,
    });
    onSelectProjectId(project.id);
    return project;
  };

  const handleCreateProduct = async () => {
    const name = productDraft.name.trim();
    if (!name) return;

    const project = await ensureProject();
    if (!project) return;

    const product = await createProductMutation.mutateAsync({
      projectId: project.id,
      name,
      description: productDraft.description.trim(),
      productReferenceNotes: productDraft.description.trim(),
      targetDurationSeconds: productDraft.duration,
      productRefs: buildManualProductRefs(productDraft.referenceUrl),
    });
    onSelectProjectId(project.id);
    onSelectProductId(product.id);
    setProductDraft(emptyProductDraft);
    onOpenOmni();
  };

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Клиент</p>
          {selectedProject || selectedClient ? (
            <Badge variant="outline" className="max-w-[8rem] truncate">
              {selectedProject ? "Omni" : "Legacy"}
            </Badge>
          ) : null}
        </div>

        <select
          value={clientSelectValue}
          onChange={(event) => handleSelectClient(event.target.value)}
          disabled={isLoadingClients || (!clients.length && !projects.length)}
          className="h-12 w-full rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="">Выберите клиента</option>
          {projects.map((project) => (
            <option key={`project-${project.id}`} value={`project:${project.id}`}>
              {resolveProjectLabel(project, clients)}
            </option>
          ))}
          {clients.map((client) => (
            <option key={`legacy-${client.id}`} value={`legacy:${client.id}`}>
              {client.name}
            </option>
          ))}
        </select>

        <div className="rounded-lg border border-border bg-card p-3">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <FolderPlus className="h-4 w-4 text-primary" />
            Новый клиент
          </div>
          <div className="space-y-2">
            <Input
              value={clientDraft.name}
              onChange={(event) => setClientDraft({ ...clientDraft, name: event.target.value })}
              placeholder="Название клиента"
              className="h-10"
            />
            <Input
              value={clientDraft.description}
              onChange={(event) => setClientDraft({ ...clientDraft, description: event.target.value })}
              placeholder="Ниша или краткий контекст"
              className="h-10"
            />
            <Button
              type="button"
              onClick={() => void handleCreateClient()}
              disabled={!clientDraft.name.trim() || createProjectMutation.isPending}
              className="min-h-10 w-full"
            >
              <Plus className="h-4 w-4" />
              Создать клиента
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Продукт</p>
          {selectedProduct ? <Badge variant="secondary">{selectedProduct.target_duration_seconds} сек</Badge> : null}
        </div>

        <select
          value={selectedProductId ? String(selectedProductId) : ""}
          onChange={(event) => {
            onSelectProductId(event.target.value ? Number(event.target.value) : null);
            onOpenOmni();
          }}
          disabled={!activeProjectId || productsQuery.isLoading || !products.length}
          className="h-12 w-full rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="">{activeProjectId ? "Выберите продукт" : "Сначала выберите клиента"}</option>
          {products.map((product: OmniProduct) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>

        <Button
          type="button"
          variant="outline"
          onClick={onOpenOmni}
          disabled={!activeProjectId && !selectedClient}
          className="min-h-10 w-full"
        >
          <BriefcaseBusiness className="h-4 w-4" />
          Открыть продукт
        </Button>

        <div className="rounded-lg border border-border bg-card p-3">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <PackagePlus className="h-4 w-4 text-primary" />
            Новый продукт
          </div>
          <div className="space-y-2">
            <Input
              value={productDraft.name}
              onChange={(event) => setProductDraft({ ...productDraft, name: event.target.value })}
              placeholder="Название продукта"
              className="h-10"
            />
            <Input
              value={productDraft.description}
              onChange={(event) => setProductDraft({ ...productDraft, description: event.target.value })}
              placeholder="Позиционирование"
              className="h-10"
            />
            <Input
              value={productDraft.referenceUrl}
              onChange={(event) => setProductDraft({ ...productDraft, referenceUrl: event.target.value })}
              placeholder="S3/ref URL продукта"
              className="h-10"
            />
            <select
              value={productDraft.duration}
              onChange={(event) => setProductDraft({ ...productDraft, duration: Number(event.target.value) })}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value={30}>30 сек / 3 сегмента</option>
              <option value={40}>40 сек / 4 сегмента</option>
            </select>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleCreateProduct()}
              disabled={!productDraft.name.trim() || (!activeProject && !selectedClient) || createProductMutation.isPending}
              className="min-h-10 w-full"
            >
              <Package className="h-4 w-4" />
              Добавить продукт
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
