"use client";

import type { ReactNode } from "react";
import { Database, PackageCheck, Sparkles, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { OmniReadinessItem } from "@/lib/omni/workspace";
import { ReadinessItem } from "./ui";

export function OmniPipelineHeader({
  clientName,
  productName,
  libraryLabel,
  readiness,
}: {
  clientName: string;
  productName: string;
  libraryLabel: string;
  readiness: OmniReadinessItem[];
}) {
  const completed = readiness.filter((item) => item.done).length;

  return (
    <header className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <Sparkles className="h-3.5 w-3.5" />
                Omni/KIE production
              </Badge>
              <Badge variant="outline" className="gap-1">
                <Database className="h-3.5 w-3.5" />
                legacy DB read-only
              </Badge>
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Библиотека сценариев бренда
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Один бренд может иметь несколько продуктов. Для каждого продукта подключаем refs, reference-бандлы и
              собираем 30-40 секунд из 10-секундных Omni-сегментов.
            </p>
          </div>
          <div className="grid gap-2 rounded-lg border border-border bg-muted/35 p-3 text-xs text-muted-foreground xl:min-w-72">
            <div className="flex items-center justify-between gap-3">
              <span>Готовность</span>
              <strong className="text-foreground">{completed}/{readiness.length}</strong>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-background">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200"
                style={{ width: `${(completed / readiness.length) * 100}%` }}
              />
            </div>
            <div className="mt-1 grid gap-1">
              <span className="truncate">Бренд: {clientName}</span>
              <span className="truncate">Продукт: {productName}</span>
              <span className="truncate">Библиотека: {libraryLabel}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-2 px-4 py-3 sm:grid-cols-2 xl:grid-cols-6">
        {readiness.map((item) => (
          <ReadinessItem key={item.key} done={item.done} label={item.label} />
        ))}
      </div>

      <div className="grid border-t border-border text-xs text-muted-foreground sm:grid-cols-3">
        <PipelineStep icon={<PackageCheck className="h-4 w-4" />} label="Setup" value="Бренд, продукты, avatar" />
        <PipelineStep icon={<Database className="h-4 w-4" />} label="Library" value="Legacy reference transcripts" />
        <PipelineStep icon={<Video className="h-4 w-4" />} label="Reel" value="Plan -> 10s segments -> stitch" />
      </div>
    </header>
  );
}

function PipelineStep({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 border-border px-4 py-3 sm:border-r sm:last:border-r-0">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="font-semibold uppercase tracking-[0.08em] text-foreground">{label}</p>
        <p className="mt-0.5 truncate">{value}</p>
      </div>
    </div>
  );
}
