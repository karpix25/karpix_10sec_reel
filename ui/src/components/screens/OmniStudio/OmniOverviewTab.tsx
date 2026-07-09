"use client";

import { FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OmniProduct, OmniProject } from "@/lib/omni/types";
import type { OmniReadinessItem } from "@/lib/omni/workspace";
import type { Client } from "@/types";
import { ReadinessItem, WorkbenchPanel } from "./ui";

export function OmniOverviewTab({
  activeProject,
  activeProduct,
  selectedClient,
  readiness,
  isCreatingProject,
  onCreateWorkspace,
}: {
  activeProject: OmniProject | null;
  activeProduct: OmniProduct | null;
  selectedClient: Client | null;
  readiness: OmniReadinessItem[];
  isCreatingProject: boolean;
  onCreateWorkspace: () => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <WorkbenchPanel
        title="Активный контекст"
        description="Клиент и продукт выбираются слева. Здесь проверяем готовность к сборке ролика."
        action={
          !activeProject && selectedClient ? (
            <Button size="sm" variant="outline" onClick={onCreateWorkspace} disabled={isCreatingProject}>
              <FolderPlus className="h-4 w-4" />
              Workspace
            </Button>
          ) : null
        }
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg bg-muted/40 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Клиент</p>
            <p className="mt-2 text-lg font-semibold text-foreground">
              {activeProject?.name || selectedClient?.name || "не выбран"}
            </p>
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
              {selectedClient?.product_info ||
                selectedClient?.target_audience ||
                activeProject?.description ||
                "Создай клиента слева или выбери legacy-клиента для подключения библиотеки."}
            </p>
          </div>
          <div className="rounded-lg bg-muted/40 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Продукт</p>
            <p className="mt-2 text-lg font-semibold text-foreground">{activeProduct?.name || "не выбран"}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {activeProduct
                ? `${activeProduct.target_duration_seconds} секунд, ${activeProduct.product_refs.length} product refs`
                : "Добавь продукт слева, чтобы refs, сценарии и queue были product-scoped."}
            </p>
          </div>
        </div>
      </WorkbenchPanel>

      <WorkbenchPanel title="Готовность" description="Минимальный путь до draft reel.">
        <div className="grid gap-2 rounded-lg bg-muted/30 p-3">
          {readiness.map((item) => (
            <ReadinessItem key={item.key} done={item.done} label={item.label} />
          ))}
        </div>
      </WorkbenchPanel>
    </div>
  );
}
