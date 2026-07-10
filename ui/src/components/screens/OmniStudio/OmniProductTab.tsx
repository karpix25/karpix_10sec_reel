"use client";

import { Image as ImageIcon, Package, PackagePlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OmniProduct, OmniProject } from "@/lib/omni/types";
import { EmptyState, QueryState, WorkbenchPanel } from "./ui";

export type ProductDraft = {
  name: string;
  description: string;
  referenceUrl: string;
  duration: number;
};

export function OmniProductTab({
  activeProject,
  activeProduct,
  products,
  selectedProductId,
  productDraft,
  isProductsLoading,
  isCreatingProduct,
  canCreateProduct,
  onSelectProduct,
  onProductDraftChange,
  onCreateProduct,
}: {
  activeProject: OmniProject | null;
  activeProduct: OmniProduct | null;
  products: OmniProduct[];
  selectedProductId: number | null;
  productDraft: ProductDraft;
  isProductsLoading: boolean;
  isCreatingProduct: boolean;
  canCreateProduct: boolean;
  onSelectProduct: (productId: number | null) => void;
  onProductDraftChange: (draft: ProductDraft) => void;
  onCreateProduct: () => void;
}) {
  const canSubmitProduct =
    Boolean(productDraft.name.trim()) &&
    Boolean(productDraft.description.trim()) &&
    Boolean(productDraft.referenceUrl.trim()) &&
    canCreateProduct &&
    !isCreatingProduct;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <WorkbenchPanel
        title="Продукты клиента"
        description="Продукт создаётся внутри активного клиента и хранит описание, фото/ref и длительность ролика."
      >
        <QueryState
          isLoading={isProductsLoading}
          loadingText="Загружаю продукты клиента"
          errorText="Не удалось загрузить продукты"
        />
        <div className="space-y-4">
          <select
            value={selectedProductId ? String(selectedProductId) : ""}
            onChange={(event) => onSelectProduct(event.target.value ? Number(event.target.value) : null)}
            disabled={!activeProject || isProductsLoading || !products.length}
            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">{activeProject ? "Выберите продукт" : "Сначала выберите или создайте клиента"}</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>

          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <PackagePlus className="h-4 w-4 text-primary" />
              Новый продукт
            </div>
            <div className="grid gap-3">
              <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Название продукта
                <Input
                  value={productDraft.name}
                  onChange={(event) => onProductDraftChange({ ...productDraft, name: event.target.value })}
                  placeholder="Например: Хлорофилл"
                  className="h-11 normal-case tracking-normal"
                />
              </label>
              <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Описание продукта
                <textarea
                  value={productDraft.description}
                  onChange={(event) => onProductDraftChange({ ...productDraft, description: event.target.value })}
                  placeholder="Позиционирование, состав, упаковка, ключевые преимущества"
                  className="min-h-28 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm font-normal normal-case tracking-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </label>
              <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Фото/ref продукта
                <Input
                  value={productDraft.referenceUrl}
                  onChange={(event) => onProductDraftChange({ ...productDraft, referenceUrl: event.target.value })}
                  placeholder="S3 URL или внешний URL изображения"
                  className="h-11 normal-case tracking-normal"
                />
              </label>
              <select
                value={productDraft.duration}
                onChange={(event) => onProductDraftChange({ ...productDraft, duration: Number(event.target.value) })}
                className="h-11 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value={30}>30 сек / 3 сегмента</option>
                <option value={40}>40 сек / 4 сегмента</option>
              </select>
              <Button
                type="button"
                onClick={onCreateProduct}
                disabled={!canSubmitProduct}
                className="min-h-11 w-full"
              >
                <Package className="h-4 w-4" />
                Добавить продукт
              </Button>
              {!canSubmitProduct ? (
                <p className="text-xs leading-5 text-muted-foreground">
                  Для создания продукта нужны название, описание, фото/ref URL и выбранный клиент.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </WorkbenchPanel>

      <WorkbenchPanel
        title="Карточка продукта"
        description="Активный продукт для refs, библиотеки сценариев и генерации роликов."
      >
        {activeProduct ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{activeProduct.target_duration_seconds} сек</Badge>
              <Badge variant={activeProduct.product_refs.length ? "success" : "outline"}>
                {activeProduct.product_refs.length} product refs
              </Badge>
            </div>
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                <ImageIcon className="h-4 w-4 text-primary" />
                {activeProduct.name}
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                {activeProduct.description || activeProduct.product_reference_notes || "Описание продукта пока не заполнено."}
              </p>
            </div>
            <div className="grid gap-2">
              {activeProduct.product_refs.map((ref) => (
                <a
                  key={ref.id}
                  href={ref.url}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate rounded-lg border border-border bg-background px-3 py-2 text-sm text-primary transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {ref.label || ref.url}
                </a>
              ))}
              {!activeProduct.product_refs.length ? (
                <EmptyState title="Фото/ref пока нет" description="Добавь URL в форме создания продукта." />
              ) : null}
            </div>
          </div>
        ) : (
          <EmptyState
            title="Продукт не выбран"
            description="Выбери существующий продукт или создай новый внутри активного клиента."
          />
        )}
      </WorkbenchPanel>
    </div>
  );
}
