"use client";

import { useMemo } from "react";
import { Archive, PenLine, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useOmniGeneratedScripts, useOmniProducts, useOmniProjects, useOmniStudio } from "@/hooks/useOmniStudio";
import { usePersistentGenerationPending } from "@/hooks/usePersistentGenerationPending";
import { useOmniReelAutoSync } from "@/hooks/useOmniReelAutoSync";
import { GeneratedScriptsList } from "./GeneratedScriptsList";
import type { OmniGenerationProvider } from "@/lib/omni/provider";

type LegacyRefsScriptScreenProps = {
  selectedProjectId: number | null;
  selectedProductId: number | null;
  onSelectProduct: (productId: number | null) => void;
  omniGenerationProvider: OmniGenerationProvider;
};

export function LegacyRefsScriptScreen({
  selectedProjectId,
  selectedProductId,
  onSelectProduct,
  omniGenerationProvider,
}: LegacyRefsScriptScreenProps) {
  const projectsQuery = useOmniProjects();
  const productsQuery = useOmniProducts(selectedProjectId);
  const studio = useOmniStudio(selectedProjectId, null, "", null);
  const scriptsQuery = useOmniGeneratedScripts(selectedProjectId, selectedProductId);

  const projects = useMemo(() => projectsQuery.data || [], [projectsQuery.data]);
  const products = useMemo(() => productsQuery.data || [], [productsQuery.data]);
  const activeProject = projects.find((project) => project.id === selectedProjectId) || null;
  const activeProduct = products.find((product) => product.id === selectedProductId) || null;
  const libraryLinks = studio.libraryLinksQuery.data || [];
  const activeBundleIds = new Set(libraryLinks.map((link) => link.legacy_client_id));
  const activeLibraries = (studio.legacyLibrariesQuery.data || []).filter((library) =>
    activeBundleIds.has(library.client_id)
  );
  const generatedScripts = scriptsQuery.data || [];
  const avatars = studio.avatarsQuery.data || [];
  const latestAvatar = avatars.find((avatar) => avatar.is_active && avatar.reference_url) || avatars[0] || null;
  const reelsPayload = studio.reelsQuery.data || { reels: [], segments: [] };
  const { pendingDraft, pendingVideo, setPendingDraft, setPendingVideo } = usePersistentGenerationPending({
    projectId: selectedProjectId,
    productId: selectedProductId,
    generatedScripts,
    reels: reelsPayload.reels,
    scriptError: studio.createGeneratedScriptMutation.isError,
    videoError: studio.createReelMutation.isError,
  });

  const canGenerate =
    Boolean(selectedProjectId) &&
    Boolean(selectedProductId) &&
    Boolean(activeBundleIds.size) &&
    !studio.createGeneratedScriptMutation.isPending;

  const handleGenerate = async () => {
    if (!selectedProjectId || !selectedProductId || !activeProject || !activeProduct || !canGenerate) return;
    setPendingDraft({
      id: `${Date.now()}`,
      startedAt: Date.now(),
      brandName: activeProject.name,
      productName: activeProduct.name,
    });
    await studio.createGeneratedScriptMutation.mutateAsync({
      projectId: selectedProjectId,
      productId: selectedProductId,
    });
  };

  const handleCreateVideo = (scriptId: number) => {
    if (!selectedProjectId || !selectedProductId || !activeProduct) return;
    setPendingVideo({ scriptId, startedAt: Date.now() });
    studio.createReelMutation.mutate({
      projectId: selectedProjectId,
      productId: selectedProductId,
      sourceGeneratedScriptId: scriptId,
      targetDurationSeconds: activeProduct.target_duration_seconds || 30,
      autoRun: true,
    });
  };

  const handleRunReel = (reelId: number) => {
    if (!selectedProjectId) return;
    studio.runReelMutation.mutate({ projectId: selectedProjectId, reelId, provider: omniGenerationProvider });
  };

  const handleSyncReel = (reelId: number) => {
    if (!selectedProjectId) return;
    studio.syncReelMutation.mutate({ projectId: selectedProjectId, reelId });
  };

  useOmniReelAutoSync({
    enabled: Boolean(selectedProjectId),
    reels: reelsPayload.reels,
    isSyncing: studio.syncReelMutation.isPending,
    onSync: handleSyncReel,
  });

  return (
    <div className="mx-auto max-w-[94rem] space-y-5">
      <header className="rounded-lg border border-border bg-card p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <Sparkles className="h-3.5 w-3.5" />
            reels-script-writer
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Archive className="h-3.5 w-3.5" />
            1 random reference transcript
          </Badge>
        </div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Legacy refs</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Написать сценарий под продукт</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Берём одну случайную оригинальную транскрибацию reference-видео из активного legacy-бандла и внедряем
              выбранный продукт в её формат, ритм, хук и структуру удержания.
            </p>
          </div>
          <Button type="button" onClick={() => void handleGenerate()} disabled={!canGenerate} className="min-h-11">
            <PenLine className="h-4 w-4" />
            {studio.createGeneratedScriptMutation.isPending ? "Пишу..." : "Написать сценарий"}
          </Button>
        </div>
      </header>

      <section className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-5">
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Контекст генерации</p>
                <h3 className="mt-1 text-lg font-semibold text-foreground">
                  {activeProject?.name || "Бренд не выбран"}
                </h3>
              </div>
              <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
                {activeBundleIds.size} бандл.
              </span>
            </div>

            <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Продукт для адаптации
              <select
                value={selectedProductId ? String(selectedProductId) : ""}
                onChange={(event) => onSelectProduct(event.target.value ? Number(event.target.value) : null)}
                disabled={!selectedProjectId || productsQuery.isLoading}
                className="h-11 rounded-lg border border-input bg-background px-3 text-sm font-semibold normal-case tracking-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">{products.length ? "Выберите продукт" : "Продукты ещё не созданы"}</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <ReadinessCard done={Boolean(activeProject)} title="Бренд" value={activeProject?.name || "не выбран"} />
              <ReadinessCard done={Boolean(activeProduct)} title="Продукт" value={activeProduct?.name || "не выбран"} />
              <ReadinessCard done={Boolean(activeBundleIds.size)} title="Бандлы" value={`${activeBundleIds.size} активно`} />
            </div>
          </div>

          <GeneratedScriptsList
            projectId={selectedProjectId}
            productId={selectedProductId}
            scripts={generatedScripts}
            isLoading={scriptsQuery.isLoading}
            pendingDraft={pendingDraft}
            pendingVideo={pendingVideo}
            canCreateVideo={Boolean(selectedProjectId && selectedProductId && activeProduct && latestAvatar)}
            isCreatingReel={studio.createReelMutation.isPending}
            isRunningReel={studio.runReelMutation.isPending}
            isSyncingReel={studio.syncReelMutation.isPending}
            reels={reelsPayload.reels}
            segments={reelsPayload.segments}
            onCreateVideo={handleCreateVideo}
            onRunReel={handleRunReel}
            onSyncReel={handleSyncReel}
          />
        </div>

        <aside className="space-y-5">
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Archive className="h-4 w-4 text-primary" />
              Активные legacy-бандлы
            </div>
            <div className="space-y-2">
              {activeLibraries.map((library) => (
                <div key={library.client_id} className="rounded-lg border border-border bg-background p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{library.name}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {library.product_keyword || library.product_info || "Legacy project bundle"}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
                      {library.scenario_count} refs
                    </span>
                  </div>
                </div>
              ))}
              {!activeLibraries.length ? (
                <p className="rounded-lg border border-dashed border-border bg-background p-3 text-sm leading-6 text-muted-foreground">
                  Сначала активируйте legacy-бандл во вкладке «Библиотека сценариев».
                </p>
              ) : null}
            </div>
          </div>

          {studio.createGeneratedScriptMutation.isError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-700">
              {studio.createGeneratedScriptMutation.error instanceof Error
                ? studio.createGeneratedScriptMutation.error.message
                : "Не удалось написать сценарий"}
            </div>
          ) : null}
        </aside>
      </section>
    </div>
  );
}

function ReadinessCard({ done, title, value }: { done: boolean; title: string; value: string }) {
  return (
    <div className={`rounded-lg border p-3 ${done ? "border-emerald-200 bg-emerald-50" : "border-border bg-background"}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</p>
      <p className="mt-1 truncate text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
