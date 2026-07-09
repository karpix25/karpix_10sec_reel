"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Film, Link2, PackagePlus, Plus, Search, Sparkles } from "lucide-react";
import { useOmniStudio } from "@/hooks/useOmniStudio";
import { OmniLegacyScenario, OmniProduct, OmniProject, OmniReelSegment } from "@/lib/omni/types";

function firstScriptLine(scenario: OmniLegacyScenario) {
  return scenario.title || scenario.topic || scenario.script.slice(0, 90) || `Сценарий #${scenario.id}`;
}

export function OmniStudioScreen() {
  const [projectId, setProjectId] = useState<number | null>(null);
  const [productId, setProductId] = useState<number | null>(null);
  const [legacySearch, setLegacySearch] = useState("");
  const [selectedScenarioId, setSelectedScenarioId] = useState<number | null>(null);
  const [projectName, setProjectName] = useState("");
  const [productName, setProductName] = useState("");
  const [productNotes, setProductNotes] = useState("");
  const [targetDurationSeconds, setTargetDurationSeconds] = useState(30);

  const studio = useOmniStudio(projectId, productId, legacySearch);
  const projects = useMemo(() => studio.projectsQuery.data || [], [studio.projectsQuery.data]);
  const products = useMemo(() => studio.productsQuery.data || [], [studio.productsQuery.data]);
  const legacyScenarios = studio.legacyScenariosQuery.data?.data || [];
  const links = useMemo(() => studio.scenarioLinksQuery.data || [], [studio.scenarioLinksQuery.data]);
  const reels = studio.reelsQuery.data?.reels || [];
  const segments = studio.reelsQuery.data?.segments || [];

  const activeProject = useMemo(
    () => projects.find((project) => project.id === projectId) || null,
    [projects, projectId]
  );
  const activeProduct = useMemo(
    () => products.find((product) => product.id === productId) || null,
    [products, productId]
  );

  const linkedScenarioIds = useMemo(
    () => new Set(links.filter((link) => !productId || link.product_id === productId).map((link) => link.legacy_scenario_id)),
    [links, productId]
  );

  const handleCreateProject = () => {
    if (!projectName.trim()) return;
    studio.createProjectMutation.mutate(
      { name: projectName.trim() },
      {
        onSuccess: (project: OmniProject) => {
          setProjectId(project.id);
          setProjectName("");
        },
      }
    );
  };

  const handleCreateProduct = () => {
    if (!projectId || !productName.trim()) return;
    studio.createProductMutation.mutate(
      {
        projectId,
        name: productName.trim(),
        productReferenceNotes: productNotes.trim(),
        targetDurationSeconds,
      },
      {
        onSuccess: (product: OmniProduct) => {
          setProductId(product.id);
          setProductName("");
          setProductNotes("");
        },
      }
    );
  };

  const handleLinkScenario = (legacyScenarioId: number) => {
    if (!projectId) return;
    studio.linkScenarioMutation.mutate({ projectId, productId, legacyScenarioId });
    setSelectedScenarioId(legacyScenarioId);
  };

  const handleCreateReel = () => {
    if (!projectId || !productId) return;
    studio.createReelMutation.mutate({
      projectId,
      productId,
      sourceLegacyScenarioId: selectedScenarioId,
      targetDurationSeconds,
      brief: activeProduct?.product_reference_notes || activeProduct?.description || "",
    });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
            <Sparkles className="h-4 w-4" />
            Omni Reels Factory
          </div>
          <h2 className="text-4xl font-bold tracking-tight text-foreground">Проекты, продукты и 10-сек сегменты</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Новый контур для Google Omni через KIE: legacy-сценарии читаются из старой БД, новые проекты и ролики пишутся отдельно.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreateReel}
          disabled={!projectId || !productId || studio.createReelMutation.isPending}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#0f172a] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Film className="h-4 w-4" />
          Создать draft reel
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <section className="space-y-4 rounded-lg border border-[#dce5ec] bg-white p-4">
          <PanelTitle title="Проект клиента" helper="Project хранит Telegram topic и общий контекст клиента." />
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <input
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="Например: Beauty Brand July"
              className="h-10 rounded-md border border-[#dce5ec] px-3 text-sm"
            />
            <IconButton onClick={handleCreateProject} disabled={studio.createProjectMutation.isPending}>
              <Plus className="h-4 w-4" />
              Создать
            </IconButton>
          </div>
          <SelectList
            items={projects}
            value={projectId}
            onChange={(id) => {
              setProjectId(id);
              setProductId(null);
            }}
            getLabel={(project) => project.name}
            empty="Проектов пока нет"
          />

          <PanelTitle title="Продукты проекта" helper="Один клиент может иметь коллекцию продуктов, каждый со своими refs." />
          <div className="grid gap-3">
            <input
              value={productName}
              onChange={(event) => setProductName(event.target.value)}
              placeholder="Название продукта"
              className="h-10 rounded-md border border-[#dce5ec] px-3 text-sm"
            />
            <textarea
              value={productNotes}
              onChange={(event) => setProductNotes(event.target.value)}
              placeholder="Заметки по продукту, упаковке, refs для Omni"
              className="min-h-20 rounded-md border border-[#dce5ec] px-3 py-2 text-sm"
            />
            <div className="flex items-center gap-3">
              <select
                value={targetDurationSeconds}
                onChange={(event) => setTargetDurationSeconds(Number(event.target.value))}
                className="h-10 rounded-md border border-[#dce5ec] px-3 text-sm"
              >
                <option value={30}>30 сек / 3 сегмента</option>
                <option value={40}>40 сек / 4 сегмента</option>
              </select>
              <IconButton onClick={handleCreateProduct} disabled={!projectId || studio.createProductMutation.isPending}>
                <PackagePlus className="h-4 w-4" />
                Добавить
              </IconButton>
            </div>
          </div>
          <SelectList
            items={products}
            value={productId}
            onChange={setProductId}
            getLabel={(product) => product.name}
            empty={activeProject ? "У проекта пока нет продуктов" : "Сначала выбери проект"}
          />
        </section>

        <section className="space-y-4 rounded-lg border border-[#dce5ec] bg-white p-4">
          <PanelTitle title="Legacy-сценарии" helper="Читаем старую БД read-only и сохраняем только связь с проектом/продуктом." />
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              value={legacySearch}
              onChange={(event) => setLegacySearch(event.target.value)}
              placeholder="Поиск по сценарию или теме"
              className="h-10 w-full rounded-md border border-[#dce5ec] pl-9 pr-3 text-sm"
            />
          </div>
          <div className="max-h-[25rem] space-y-2 overflow-auto pr-1">
            {legacyScenarios.map((scenario) => (
              <button
                key={scenario.id}
                type="button"
                onClick={() => handleLinkScenario(scenario.id)}
                disabled={!projectId || studio.linkScenarioMutation.isPending}
                className={`w-full rounded-md border px-3 py-3 text-left transition ${
                  linkedScenarioIds.has(scenario.id)
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-[#e2e8f0] hover:border-primary/40 hover:bg-[#f8fafc]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{firstScriptLine(scenario)}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{scenario.script}</p>
                  </div>
                  <Link2 className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
              </button>
            ))}
            {!legacyScenarios.length && (
              <div className="rounded-md border border-dashed border-[#dce5ec] p-6 text-center text-sm text-muted-foreground">
                {studio.legacyScenariosQuery.isError
                  ? "Legacy DB не настроена или недоступна."
                  : "Сценарии не найдены."}
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-[#dce5ec] bg-white p-4">
        <PanelTitle title="Reel jobs" helper="Пока создаём draft: далее сюда подключается submit/poll/stitch через KIE Omni." />
        <div className="overflow-hidden rounded-md border border-[#e2e8f0]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#f8fafc] text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Reel</th>
                <th className="px-3 py-2">Project/Product</th>
                <th className="px-3 py-2">Duration</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Segments</th>
              </tr>
            </thead>
            <tbody>
              {reels.map((reel) => (
                <tr key={reel.id} className="border-t border-[#e2e8f0]">
                  <td className="px-3 py-3 font-semibold">#{reel.id}</td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {activeProject?.name || reel.project_id} / {activeProduct?.name || reel.product_id}
                  </td>
                  <td className="px-3 py-3">{reel.target_duration_seconds}s</td>
                  <td className="px-3 py-3">{reel.status}</td>
                  <td className="px-3 py-3">
                    <SegmentDots segments={segments.filter((segment) => segment.reel_id === reel.id)} />
                  </td>
                </tr>
              ))}
              {!reels.length && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                    Draft reels появятся здесь после выбора проекта и продукта.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function PanelTitle({ title, helper }: { title: string; helper: string }) {
  return (
    <div>
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}

function IconButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#dce5ec] px-3 text-sm font-semibold hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function SelectList<T extends { id: number }>({
  items,
  value,
  onChange,
  getLabel,
  empty,
}: {
  items: T[];
  value: number | null;
  onChange: (id: number) => void;
  getLabel: (item: T) => string;
  empty: string;
}) {
  if (!items.length) {
    return <div className="rounded-md bg-[#f8fafc] px-3 py-3 text-sm text-muted-foreground">{empty}</div>;
  }

  return (
    <div className="grid gap-2">
      {items.map((item) => (
        <button
          type="button"
          key={item.id}
          onClick={() => onChange(item.id)}
          className={`rounded-md border px-3 py-2 text-left text-sm ${
            value === item.id ? "border-primary bg-primary/5 font-semibold text-primary" : "border-[#e2e8f0]"
          }`}
        >
          {getLabel(item)}
        </button>
      ))}
    </div>
  );
}

function SegmentDots({ segments }: { segments: OmniReelSegment[] }) {
  return (
    <div className="flex gap-1.5">
      {segments.map((segment) => (
        <span
          key={segment.id}
          title={`${segment.segment_index}: ${segment.status}`}
          className="h-2.5 w-8 rounded-full bg-slate-300"
        />
      ))}
    </div>
  );
}
