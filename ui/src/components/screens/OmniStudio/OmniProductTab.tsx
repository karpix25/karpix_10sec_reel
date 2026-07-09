"use client";

import { Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { OmniProduct } from "@/lib/omni/types";
import { EmptyState, WorkbenchPanel } from "./ui";

export function OmniProductTab({ activeProduct }: { activeProduct: OmniProduct | null }) {
  return (
    <WorkbenchPanel
      title="Настройки продукта"
      description="Здесь видны product refs и длительность активного продукта. Редактирование полей добавим следующим шагом через PUT products."
    >
      {activeProduct ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{activeProduct.target_duration_seconds} сек</Badge>
            <Badge variant={activeProduct.product_refs.length ? "success" : "outline"}>
              {activeProduct.product_refs.length} product refs
            </Badge>
            <Badge variant={activeProduct.avatar_refs.length ? "success" : "outline"}>
              {activeProduct.avatar_refs.length} avatar refs
            </Badge>
          </div>
          <div className="rounded-lg border border-border bg-background p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Package className="h-4 w-4 text-primary" />
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
              <EmptyState
                title="Product refs пока нет"
                description="Добавь S3/ref URL в левом блоке создания продукта или позже через upload flow."
              />
            ) : null}
          </div>
        </div>
      ) : (
        <EmptyState
          title="Продукт не выбран"
          description="Выбери или создай продукт слева. Все сценарии, refs и reel plans будут привязаны к нему."
        />
      )}
    </WorkbenchPanel>
  );
}
