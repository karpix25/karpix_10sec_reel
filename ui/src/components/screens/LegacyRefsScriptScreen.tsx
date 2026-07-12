"use client";

import { useMemo } from "react";
import { Archive, ExternalLink, FileText, Film, PenLine, Play, RefreshCw, Sparkles, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useOmniGeneratedScripts, useOmniProducts, useOmniProjects, useOmniStudio } from "@/hooks/useOmniStudio";
import { usePersistentGenerationPending } from "@/hooks/usePersistentGenerationPending";
import { useOmniReelAutoSync } from "@/hooks/useOmniReelAutoSync";
import type { OmniGeneratedScript, OmniReel, OmniReelSegment } from "@/lib/omni/types";
import { GeneratedScriptPromptTabs } from "./GeneratedScriptPromptTabs";
import { PendingGeneratedScriptCard, PendingVideoCard, type PendingScriptDraft, type PendingVideoDraft } from "./GenerationPendingCards";
import { SegmentDots, StatusBadge } from "./OmniStudio/ui";
import { getVideoStageLabel, VideoProgressSteps } from "./VideoProgressStatus";

type LegacyRefsScriptScreenProps = {
  selectedProjectId: number | null;
  selectedProductId: number | null;
  onSelectProduct: (productId: number | null) => void;
};

export function LegacyRefsScriptScreen({
  selectedProjectId,
  selectedProductId,
  onSelectProduct,
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
    studio.runReelMutation.mutate({ projectId: selectedProjectId, reelId });
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

function GeneratedScriptsList({
  projectId,
  productId,
  scripts,
  isLoading,
  pendingDraft,
  pendingVideo,
  canCreateVideo,
  isCreatingReel,
  isRunningReel,
  isSyncingReel,
  reels,
  segments,
  onCreateVideo,
  onRunReel,
  onSyncReel,
}: {
  projectId: number | null;
  productId: number | null;
  scripts: OmniGeneratedScript[];
  isLoading: boolean;
  pendingDraft: PendingScriptDraft | null;
  pendingVideo: PendingVideoDraft | null;
  canCreateVideo: boolean;
  isCreatingReel: boolean;
  isRunningReel: boolean;
  isSyncingReel: boolean;
  reels: OmniReel[];
  segments: OmniReelSegment[];
  onCreateVideo: (scriptId: number) => void;
  onRunReel: (reelId: number) => void;
  onSyncReel: (reelId: number) => void;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Draft-сценарии</p>
          <h3 className="mt-1 text-lg font-semibold text-foreground">Созданные сценарии</h3>
        </div>
        <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
          {scripts.length + (pendingDraft ? 1 : 0)}
        </span>
      </div>
      <div className="grid min-w-0 gap-3">
        {pendingDraft ? <PendingGeneratedScriptCard draft={pendingDraft} /> : null}
        {scripts.map((script) => {
          const scriptReels = reels.filter(
            (reel) =>
              reel.source_generated_script_id === script.id ||
              (!reel.source_generated_script_id &&
                Boolean(script.source_legacy_scenario_id) &&
                reel.source_legacy_scenario_id === script.source_legacy_scenario_id)
          );
          const latestReel = scriptReels[0] || null;
          const latestSegments = latestReel ? segments.filter((segment) => segment.reel_id === latestReel.id) : [];

          return (
          <article key={script.id} className="min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-background p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm font-semibold text-foreground">
                  {script.hook || script.title || "Сценарий без заголовка"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Ref #{script.source_legacy_scenario_id || "n/a"} · {new Date(script.created_at).toLocaleString("ru-RU")}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onCreateVideo(script.id)}
                  disabled={!canCreateVideo || isCreatingReel || pendingVideo?.scriptId === script.id}
                  className="min-h-9 whitespace-nowrap"
                >
                  <Film className="h-4 w-4" />
                  Создать видео
                </Button>
                {latestReel ? (
                  <>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={() => onRunReel(latestReel.id)}
                      disabled={isRunningReel || latestReel.status === "completed"}
                      title="Запустить сегменты"
                      aria-label="Запустить сегменты"
                      className="h-9 w-9"
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={() => onSyncReel(latestReel.id)}
                      disabled={isSyncingReel}
                      title="Проверить статус и собрать"
                      aria-label="Проверить статус и собрать"
                      className="h-9 w-9"
                    >
                      <RefreshCw className={`h-4 w-4 ${isSyncingReel ? "animate-spin" : ""}`} />
                    </Button>
                  </>
                ) : (
                  <FileText className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
            <pre className="max-h-72 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-3 text-sm leading-6 text-foreground">
              {script.script}
            </pre>
            {script.caption ? (
              <p className="mt-3 max-w-full overflow-hidden break-words rounded-lg border border-border bg-card p-3 text-sm leading-6 text-muted-foreground">
                {script.caption}
              </p>
            ) : null}
            {latestReel ? (
              <div className="mt-3 rounded-lg border border-border bg-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Видео</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Reel #{latestReel.id} · {latestReel.target_duration_seconds} сек · {latestReel.segment_count} сегмента
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {getVideoStageLabel(latestReel, latestSegments)}
                    </p>
                  </div>
                  <StatusBadge status={latestReel.status} />
                </div>

                {latestReel.final_video_url ? (
                  <div className="mt-3 overflow-hidden rounded-lg border border-border bg-black">
                    <video
                      src={latestReel.final_video_url}
                      controls
                      playsInline
                      className="aspect-[9/16] max-h-[34rem] w-full object-contain"
                    />
                  </div>
                ) : null}

                {latestSegments.length ? (
                  <div className="mt-3 space-y-3">
                    <SegmentDots segments={latestSegments} />
                    <VideoProgressSteps reel={latestReel} segments={latestSegments} />
                  </div>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {latestReel.final_video_url ? (
                    <a
                      href={latestReel.final_video_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-primary hover:bg-muted"
                      title="Открыть S3 preview"
                      aria-label="Открыть S3 preview"
                    >
                      <Video className="h-4 w-4" />
                    </a>
                  ) : null}
                  {latestReel.yandex_public_url ? (
                    <a
                      href={latestReel.yandex_public_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-primary hover:bg-muted"
                      title="Открыть на Яндекс Диске"
                      aria-label="Открыть на Яндекс Диске"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : null}
                  {latestReel.yandex_disk_path ? (
                    <span className="min-w-0 truncate rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                      {latestReel.yandex_disk_path}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
            {!latestReel && pendingVideo?.scriptId === script.id ? <PendingVideoCard /> : null}
            <GeneratedScriptPromptTabs projectId={projectId} productId={productId} scriptId={script.id} />
          </article>
          );
        })}
        {!scripts.length && !isLoading && !pendingDraft ? (
          <div className="rounded-lg border border-dashed border-border bg-background p-6 text-center text-sm text-muted-foreground">
            Нажмите «Написать сценарий», и здесь появится первый draft.
          </div>
        ) : null}
        {isLoading ? (
          <div className="rounded-lg border border-border bg-background p-6 text-sm text-muted-foreground">
            Загружаю сценарии...
          </div>
        ) : null}
      </div>
    </div>
  );
}
