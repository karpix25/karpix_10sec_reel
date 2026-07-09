import { ArrowRight, Database, PackageCheck, Sparkles, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Client, Screen, TopicCard } from "@/types";
import { formatUsd } from "@/lib/generation-costs";

interface DashboardScreenProps {
  selectedClient?: Client;
  selectedClientId?: string;
  totalReferences: number;
  totalScenarios: number;
  topicCards: TopicCard[];
  costStats: {
    totalPrompts: number;
    totalHeygenDuration: number;
    totalCostUsd: number;
  };
  setScreen: (screen: Screen) => void;
}

const workflow = [
  { icon: PackageCheck, title: "Продукты", text: "Создай несколько продуктов клиента и добавь reference assets." },
  { icon: Sparkles, title: "Avatar", text: "Сохрани клиентский avatar prompt и позже запусти генерацию через KIE Omni." },
  { icon: Database, title: "Библиотеки", text: "Подключи старые сценарии read-only к конкретному продукту." },
  { icon: Video, title: "Видео", text: "Собери 30-40 секунд из 10-секундных stitch-friendly сегментов." },
];

export function DashboardScreen({
  selectedClient,
  totalReferences,
  totalScenarios,
  topicCards,
  costStats,
  setScreen,
}: DashboardScreenProps) {
  return (
    <div className="mx-auto max-w-[94rem] space-y-5">
      <section className="rounded-lg border border-border bg-card">
        <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Client workspace</p>
            <h2 className="mt-2 max-w-3xl text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {selectedClient?.name || "Выбери клиента"}, затем собирай продукты и рилсы в Omni
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
              Главный контур теперь строится вокруг клиента и его продуктовой линейки. Старые refs, сценарии и
              генератор остаются доступными как legacy-инструменты, но production pipeline находится в Omni.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <Button size="lg" onClick={() => setScreen("omni")} className="min-h-11">
                <Sparkles className="h-4 w-4" />
                Открыть производство
              </Button>
              <Button size="lg" variant="outline" onClick={() => setScreen("references")} className="min-h-11">
                Legacy библиотека
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/35 p-4">
            <p className="text-sm font-semibold text-foreground">Контекст клиента</p>
            <p className="mt-2 line-clamp-5 text-sm leading-6 text-muted-foreground">
              {selectedClient?.product_info ||
                selectedClient?.target_audience ||
                "Заполни контекст в настройках, чтобы сценарии и prompts точнее попадали в продукт."}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {workflow.map((item) => (
          <div key={item.title} className="rounded-lg border border-border bg-card p-4">
            <item.icon className="h-5 w-5 text-primary" />
            <h3 className="mt-3 text-sm font-semibold text-foreground">{item.title}</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.text}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Legacy refs" value={totalReferences} helper="read/import source" />
        <Metric label="Legacy scenarios" value={totalScenarios} helper="old DB + generated" />
        <Metric label="Topic cards" value={topicCards.length} helper="legacy pattern layer" />
        <Metric label="Cost" value={formatUsd(costStats.totalCostUsd)} helper={`${costStats.totalPrompts} prompts`} />
      </section>
    </div>
  );
}

function Metric({ label, value, helper }: { label: string; value: number | string; helper: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}
