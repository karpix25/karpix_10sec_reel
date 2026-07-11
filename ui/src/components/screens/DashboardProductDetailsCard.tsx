"use client";

import { useState } from "react";
import { Check, ImagePlus, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OmniProduct, OmniReferenceAsset } from "@/lib/omni/types";

export type ProductProfileDraft = {
  name: string;
  description: string;
  productRefs: OmniReferenceAsset[];
};

type DashboardProductDetailsCardProps = {
  product: OmniProduct | null;
  isSaving?: boolean;
  isUploading?: boolean;
  isDeleting?: boolean;
  onSave?: (productId: number, draft: ProductProfileDraft) => void | Promise<unknown>;
  onUploadImages?: (files: FileList) => Promise<OmniReferenceAsset[]>;
  onDeleteProduct?: (productId: number) => void | Promise<unknown>;
};

function getProductDraft(product: OmniProduct | null): ProductProfileDraft {
  return {
    name: product?.name || "",
    description: product?.description || "",
    productRefs: product?.product_refs || [],
  };
}

function areRefsEqual(left: OmniReferenceAsset[], right: OmniReferenceAsset[]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function markPrimaryRefs(refs: OmniReferenceAsset[]): OmniReferenceAsset[] {
  return refs.map((ref, index) => ({
    ...ref,
    role: index === 0 ? ("product_primary" as const) : ("product_secondary" as const),
    is_primary: index === 0,
  }));
}

export function DashboardProductDetailsCard({
  product,
  isSaving = false,
  isUploading = false,
  isDeleting = false,
  onSave,
  onUploadImages,
  onDeleteProduct,
}: DashboardProductDetailsCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<ProductProfileDraft>(() => getProductDraft(product));

  const savedDraft = getProductDraft(product);
  const isBusy = isSaving || isUploading || isDeleting;
  const hasChanges =
    draft.name.trim() !== savedDraft.name ||
    draft.description.trim() !== savedDraft.description ||
    !areRefsEqual(draft.productRefs, savedDraft.productRefs);
  const canSave = Boolean(product && onSave && draft.name.trim() && hasChanges && !isBusy);

  const handleCancel = () => {
    setDraft(savedDraft);
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!product || !canSave || !onSave) return;
    await onSave(product.id, {
      name: draft.name.trim(),
      description: draft.description.trim(),
      productRefs: markPrimaryRefs(draft.productRefs),
    });
    setIsEditing(false);
  };

  const handleUploadImages = async (files: FileList | null) => {
    if (!files?.length || !onUploadImages) return;
    const refs = await onUploadImages(files);
    setDraft((current) => ({
      ...current,
      productRefs: markPrimaryRefs([...current.productRefs, ...refs]),
    }));
  };

  const handleDeleteRef = (refId: string) => {
    setDraft((current) => ({
      ...current,
      productRefs: markPrimaryRefs(current.productRefs.filter((ref) => ref.id !== refId)),
    }));
  };

  const handleDeleteProduct = async () => {
    if (!product || !onDeleteProduct) return;
    const confirmation = window.prompt(
      `Удаление продукта "${product.name}" также удалит связанные сценарии, бандлы, рилсы и сегменты.\n\nВведите название продукта для подтверждения.`
    );
    if (confirmation?.trim() !== product.name) return;
    await onDeleteProduct(product.id);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">Активный продукт</p>
        {product ? (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="destructive"
              size="icon-sm"
              onClick={() => void handleDeleteProduct()}
              disabled={isBusy}
              aria-label="Удалить продукт"
              title="Удалить продукт"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            {!isEditing ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  setDraft(savedDraft);
                  setIsEditing(true);
                }}
                disabled={isBusy}
                aria-label="Редактировать продукт"
                title="Редактировать продукт"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {product ? (
        <div className="mt-3 space-y-3">
          {isEditing ? (
            <div className="grid gap-3">
              <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Название продукта
                <Input
                  value={draft.name}
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  disabled={isSaving}
                  className="h-11 normal-case tracking-normal"
                />
              </label>
              <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Описание продукта
                <textarea
                  value={draft.description}
                  onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                  disabled={isSaving}
                  rows={5}
                  className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm font-normal normal-case leading-6 tracking-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <div className="grid gap-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Фото продукта
                  </p>
                  <label className="inline-flex">
                    <Input
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={!onUploadImages || isBusy}
                      onChange={(event) => {
                        const input = event.currentTarget;
                        void handleUploadImages(input.files).finally(() => {
                          input.value = "";
                        });
                      }}
                      className="sr-only"
                    />
                    <span className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-sm font-medium text-foreground transition hover:bg-muted">
                      <ImagePlus className="h-4 w-4" />
                      {isUploading ? "Загружаю" : "Добавить фото"}
                    </span>
                  </label>
                </div>

                {draft.productRefs.length ? (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {draft.productRefs.map((ref) => (
                      <div key={ref.id} className="relative overflow-hidden rounded-lg border border-border bg-background">
                        <img src={ref.url} alt={ref.label || draft.name} className="aspect-square w-full object-cover" />
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon-xs"
                          onClick={() => handleDeleteRef(ref.id)}
                          disabled={isBusy}
                          className="absolute right-2 top-2"
                          aria-label="Удалить фото продукта"
                          title="Удалить фото"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-border bg-background p-3 text-sm leading-6 text-muted-foreground">
                    Фото продукта пока не добавлены.
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={handleCancel} disabled={isBusy} className="min-h-10">
                  <X className="h-4 w-4" />
                  Отмена
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={!canSave}
                  className="min-h-10"
                  title={onSave ? undefined : "Сохранение подключится через update hook"}
                >
                  <Check className="h-4 w-4" />
                  {isSaving ? "Сохраняю" : "Сохранить"}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <h4 className="text-lg font-semibold text-foreground">{product.name}</h4>
              <p className="text-sm leading-6 text-muted-foreground">
                {product.description || "Описание продукта пока не заполнено."}
              </p>
            </>
          )}

          {!isEditing ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                {product.product_refs.map((ref) => (
                  <a
                    key={ref.id}
                    href={ref.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block overflow-hidden rounded-lg border border-border bg-background transition hover:bg-muted/40"
                  >
                    <img src={ref.url} alt={ref.label || product.name} className="aspect-square w-full object-cover" />
                  </a>
                ))}
              </div>
              {!product.product_refs.length ? (
                <p className="text-sm leading-6 text-muted-foreground">Картинки продукта пока не загружены.</p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Выберите продукт из списка или создайте новый.</p>
      )}
    </div>
  );
}
