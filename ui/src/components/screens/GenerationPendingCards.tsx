"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import type { OmniGenerationProvider } from "@/lib/omni/provider";
import { getOmniGenerationProviderLabel } from "@/lib/omni/provider";

export type PendingScriptDraft = {
  id: string;
  startedAt: number;
  brandName: string;
  productName: string;
};

export type PendingVideoDraft = {
  scriptId: number;
  startedAt: number;
};

export function PendingGeneratedScriptCard({ draft }: { draft: PendingScriptDraft }) {
  return (
    <article className="min-w-0 max-w-full overflow-hidden rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm font-semibold text-foreground">Сценарий пишется</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {draft.brandName} · {draft.productName}
          </p>
        </div>
        <PendingIcon />
      </div>
      <PendingSteps
        steps={[
          { label: "Reference выбран из активных бандлов", done: true },
          { label: "Продукт передан в адаптацию", done: true },
          { label: "Пишу hook, сценарий, caption и CTA", active: true },
        ]}
      />
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        Обычно это занимает немного времени. Карточка автоматически заменится готовым draft-сценарием.
      </p>
    </article>
  );
}

export function PendingVideoCard({ provider }: { provider: OmniGenerationProvider }) {
  const providerLabel = getOmniGenerationProviderLabel(provider);

  return (
    <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Видео создается</p>
          <p className="mt-1 text-xs text-muted-foreground">Готовлю {providerLabel} job для этого сценария</p>
        </div>
        <PendingIcon />
      </div>
      <PendingSteps
        steps={[
          { label: "Собираю план сегментов", active: true },
          { label: `Отправлю сегменты в ${providerLabel}` },
          { label: "Сохраню результат в S3 и Яндекс" },
        ]}
      />
    </div>
  );
}

function PendingSteps({ steps }: { steps: Array<{ label: string; done?: boolean; active?: boolean }> }) {
  return (
    <div className="rounded-lg bg-background/80 p-3">
      <div className="grid gap-2">
        {steps.map((step) => (
          <div key={step.label} className="flex items-center gap-2 text-xs text-muted-foreground">
            {step.done ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : step.active ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <span className="h-4 w-4 rounded-full border border-border" />
            )}
            <span className={step.done || step.active ? "font-medium text-foreground" : ""}>{step.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PendingIcon() {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background text-primary">
      <Loader2 className="h-4 w-4 animate-spin" />
    </div>
  );
}
