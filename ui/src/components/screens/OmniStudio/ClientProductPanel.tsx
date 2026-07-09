"use client";

import { PackagePlus, Plus, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OmniProduct, OmniProject } from "@/lib/omni/types";
import type { Client } from "@/types";
import { EmptyState, QueryState, WorkbenchPanel } from "./ui";

export type ProductDraft = {
  name: string;
  description: string;
  productReferenceUrl: string;
  avatarReferenceNotes: string;
  targetDurationSeconds: number;
};

export function ClientProductPanel({
  selectedClient,
  projects,
  products,
  activeProject,
  activeProductId,
  productDraft,
  isProjectsLoading,
  isProductsLoading,
  isCreatingProject,
  isCreatingProduct,
  onCreateWorkspace,
  onSelectProject,
  onSelectProduct,
  onProductDraftChange,
  onCreateProduct,
}: {
  selectedClient: Client | null;
  projects: OmniProject[];
  products: OmniProduct[];
  activeProject: OmniProject | null;
  activeProductId: number | null;
  productDraft: ProductDraft;
  isProjectsLoading: boolean;
  isProductsLoading: boolean;
  isCreatingProject: boolean;
  isCreatingProduct: boolean;
  onCreateWorkspace: () => void;
  onSelectProject: (projectId: number) => void;
  onSelectProduct: (productId: number) => void;
  onProductDraftChange: (draft: ProductDraft) => void;
  onCreateProduct: () => void;
}) {
  return (
    <div className="space-y-4">
      <WorkbenchPanel
        title="Клиент"
        description="Omni workspace связывает клиента, продукты, Telegram topic и новые draft-ролики."
        action={
          <Button size="sm" variant="outline" onClick={onCreateWorkspace} disabled={!selectedClient || isCreatingProject}>
            <Plus className="h-4 w-4" />
            Workspace
          </Button>
        }
      >
        <QueryState
          isLoading={isProjectsLoading}
          loadingText="Загружаю workspace клиентов"
          errorText="Не удалось загрузить workspace"
        />
        {!selectedClient ? (
          <EmptyState
            title="Клиент не выбран"
            description="Выбери клиента в левом меню, чтобы создать продукты, аватар и подключить сценарии."
          />
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-sm font-semibold text-foreground">{selectedClient.name}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                {selectedClient.product_info || selectedClient.target_audience || "Контекст клиента пока пустой."}
              </p>
            </div>
            <div className="grid gap-2">
              {projects.map((project) => (
                <button
                  type="button"
                  key={project.id}
                  onClick={() => onSelectProject(project.id)}
                  className={`min-h-11 rounded-lg border px-3 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    activeProject?.id === project.id
                      ? "border-primary bg-primary/5 font-semibold text-primary"
                      : "border-border bg-background hover:bg-muted/50"
                  }`}
                >
                  {project.name}
                </button>
              ))}
              {!projects.length && (
                <EmptyState
                  title="Workspace еще не создан"
                  description="Создай рабочее пространство для выбранного клиента. Новые продукты и видео будут писаться в новую БД."
                />
              )}
            </div>
          </div>
        )}
      </WorkbenchPanel>

      <WorkbenchPanel title="Продукты" description="У клиента может быть несколько продуктов, каждый со своими refs для Omni.">
        <QueryState
          isLoading={isProductsLoading}
          loadingText="Загружаю продукты"
          errorText="Не удалось загрузить продукты"
        />
        <div className="space-y-3">
          <Input
            value={productDraft.name}
            onChange={(event) => onProductDraftChange({ ...productDraft, name: event.target.value })}
            placeholder="Название продукта"
            disabled={!activeProject}
            className="h-11"
          />
          <textarea
            value={productDraft.description}
            onChange={(event) => onProductDraftChange({ ...productDraft, description: event.target.value })}
            placeholder="Описание продукта, позиционирование, важные детали упаковки"
            disabled={!activeProject}
            className="min-h-24 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
          <Input
            value={productDraft.productReferenceUrl}
            onChange={(event) => onProductDraftChange({ ...productDraft, productReferenceUrl: event.target.value })}
            placeholder="S3 URL картинки/видео продукта"
            disabled={!activeProject}
            className="h-11"
          />
          <textarea
            value={productDraft.avatarReferenceNotes}
            onChange={(event) => onProductDraftChange({ ...productDraft, avatarReferenceNotes: event.target.value })}
            placeholder="Как аватар должен взаимодействовать с этим продуктом"
            disabled={!activeProject}
            className="min-h-20 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={productDraft.targetDurationSeconds}
              onChange={(event) =>
                onProductDraftChange({ ...productDraft, targetDurationSeconds: Number(event.target.value) })
              }
              disabled={!activeProject}
              className="h-11 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value={30}>30 сек / 3 сегмента</option>
              <option value={40}>40 сек / 4 сегмента</option>
            </select>
            <Button
              size="lg"
              variant="outline"
              onClick={onCreateProduct}
              disabled={!activeProject || !productDraft.name.trim() || isCreatingProduct}
              className="min-h-11 whitespace-nowrap"
            >
              <PackagePlus className="h-4 w-4" />
              Добавить продукт
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          {products.map((product) => (
            <button
              type="button"
              key={product.id}
              onClick={() => onSelectProduct(product.id)}
              className={`min-h-14 rounded-lg border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                activeProductId === product.id ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-muted/50"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{product.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{product.target_duration_seconds} сек</p>
                </div>
                <UploadCloud className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
              </div>
            </button>
          ))}
          {!products.length && (
            <EmptyState
              title={activeProject ? "Продуктов пока нет" : "Сначала нужен workspace"}
              description="Добавь продукт клиента, чтобы подключить библиотеку сценариев и подготовить видео."
            />
          )}
        </div>
      </WorkbenchPanel>
    </div>
  );
}
