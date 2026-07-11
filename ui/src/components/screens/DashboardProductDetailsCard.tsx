"use client";

import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OmniProduct } from "@/lib/omni/types";

export type ProductProfileDraft = {
  name: string;
  description: string;
};

type DashboardProductDetailsCardProps = {
  product: OmniProduct | null;
  isSaving?: boolean;
  onSave?: (productId: number, draft: ProductProfileDraft) => void | Promise<unknown>;
};

function getProductDraft(product: OmniProduct | null): ProductProfileDraft {
  return {
    name: product?.name || "",
    description: product?.description || "",
  };
}

export function DashboardProductDetailsCard({ product, isSaving = false, onSave }: DashboardProductDetailsCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<ProductProfileDraft>(() => getProductDraft(product));

  const savedDraft = getProductDraft(product);
  const hasChanges = draft.name.trim() !== savedDraft.name || draft.description.trim() !== savedDraft.description;
  const canSave = Boolean(product && onSave && draft.name.trim() && hasChanges && !isSaving);

  const handleCancel = () => {
    setDraft(savedDraft);
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!product || !canSave || !onSave) return;
    await onSave(product.id, {
      name: draft.name.trim(),
      description: draft.description.trim(),
    });
    setIsEditing(false);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">Активный продукт</p>
        {product && !isEditing ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              setDraft(savedDraft);
              setIsEditing(true);
            }}
            aria-label="Редактировать продукт"
            title="Редактировать продукт"
          >
            <Pencil className="h-4 w-4" />
          </Button>
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
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={handleCancel} disabled={isSaving} className="min-h-10">
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
        </div>
      ) : (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Выберите продукт из списка или создайте новый.</p>
      )}
    </div>
  );
}
