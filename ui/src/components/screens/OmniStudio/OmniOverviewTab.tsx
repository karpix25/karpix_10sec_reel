"use client";

import { FolderPlus, MessageSquareText, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OmniProduct, OmniProject } from "@/lib/omni/types";
import type { OmniReadinessItem } from "@/lib/omni/workspace";
import type { Client } from "@/types";
import { EmptyState, ReadinessItem, WorkbenchPanel } from "./ui";

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
  const clientName = activeProject?.name || selectedClient?.name || "Бренд не выбран";
  const audience = selectedClient?.target_audience?.trim() || activeProject?.target_audience?.trim();
  const toneOfVoice = selectedClient?.brand_voice?.trim() || activeProject?.brand_voice?.trim();
  const clientContext = selectedClient?.product_info?.trim() || activeProject?.description?.trim();

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <WorkbenchPanel
        title="Карточка бренда"
        description="Слева выбираем или создаём бренд. Здесь держим бриф бренда: ЦА, tone of voice и контекст."
        action={
          !activeProject && selectedClient ? (
            <Button size="sm" variant="outline" onClick={onCreateWorkspace} disabled={isCreatingProject}>
              <FolderPlus className="h-4 w-4" />
              Создать карточку
            </Button>
          ) : null
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Бренд</p>
            <p className="mt-2 text-xl font-semibold text-foreground">{clientName}</p>
            {clientContext ? (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{clientContext}</p>
            ) : (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Выбери бренд слева или создай новый, чтобы собрать карточку бренда.
              </p>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Target className="h-4 w-4 text-primary" />
                Целевая аудитория
              </div>
              <p className="min-h-24 text-sm leading-6 text-muted-foreground">
                {audience || "Для legacy-бренда ЦА подтянется из старой базы. Для нового бренда пока заполни контекст в описании."}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                <MessageSquareText className="h-4 w-4 text-primary" />
                Tone of voice
              </div>
              <p className="min-h-24 text-sm leading-6 text-muted-foreground">
                {toneOfVoice || "Tone of voice пока не задан. Он нужен, чтобы сценарии звучали в голосе конкретного бренда."}
              </p>
            </div>
          </div>

          {activeProduct ? (
            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Активный продукт</p>
              <p className="mt-2 text-base font-semibold text-foreground">{activeProduct.name}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {activeProduct.description || activeProduct.product_reference_notes || "Описание продукта пока не заполнено."}
              </p>
            </div>
          ) : (
            <EmptyState
              title="Продукт ещё не выбран"
              description="Перейди во вкладку «Продукт», создай продукт внутри бренда и добавь фото/ref."
            />
          )}
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
