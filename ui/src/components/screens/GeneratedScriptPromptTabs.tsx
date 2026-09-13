"use client";

import axios from "axios";
import { useMutation } from "@tanstack/react-query";
import { Loader2, WandSparkles } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOmniGeneratedScriptPrompts } from "@/hooks/useOmniStudio";
import { OmniSegmentPromptDetails } from "./OmniStudio/OmniSegmentPromptDetails";
import type { OmniGenerationProvider } from "@/lib/omni/provider";
import { getOmniGenerationProviderLabel } from "@/lib/omni/provider";
import { Button } from "@/components/ui/button";

export function GeneratedScriptPromptTabs({
  projectId,
  productId,
  scriptId,
  provider,
}: {
  projectId: number | null;
  productId: number | null;
  scriptId: number;
  provider: OmniGenerationProvider;
}) {
  const promptsQuery = useOmniGeneratedScriptPrompts(projectId, productId, scriptId, provider);
  const preparation = useMutation({
    mutationFn: () => axios.post(`/api/omni/generated-scripts/${scriptId}/prompts`, null, {
      params: { projectId, productId, provider },
    }),
    onSuccess: () => promptsQuery.refetch(),
  });
  const prompts = promptsQuery.isError ? [] : promptsQuery.data || [];
  const firstValue = prompts[0] ? String(prompts[0].segmentIndex) : "loading";
  const errorMessage = getPromptErrorMessage(preparation.error || promptsQuery.error);

  return (
    <div className="mt-3 max-w-full overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <WandSparkles className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">{getOmniGenerationProviderLabel(provider)} · промпты</p>
            <p className="truncate text-xs text-muted-foreground">Промпты для частей 4/6/8/10 секунд</p>
          </div>
        </div>
        {prompts.length ? (
          <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
            {prompts.length} части
          </span>
        ) : null}
      </div>

      {promptsQuery.isLoading ? (
        <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Загружаю сохранённый план…
        </div>
      ) : null}

      {promptsQuery.isError || preparation.isError ? (
        <div className="px-3 py-4 text-xs leading-5 text-destructive">
          <p className="font-semibold">Не удалось подготовить или загрузить план сценария.</p>
          {errorMessage ? <p className="mt-1 text-destructive/80">{errorMessage}</p> : null}
        </div>
      ) : null}

      {!promptsQuery.isLoading && !prompts.length ? (
        <div className="space-y-3 px-3 py-4 text-xs text-muted-foreground">
          <p>Сохранённого плана для текущих данных пока нет. Подготовка проверит сценарий и кадры; изображения и видео на этом шаге не генерируются.</p>
          <Button size="sm" disabled={!projectId || !productId || preparation.isPending} onClick={() => preparation.mutate()}>
            {preparation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {preparation.isPending ? "Готовлю план…" : "Подготовить план"}
          </Button>
        </div>
      ) : null}

      {prompts.length ? (
        <Tabs defaultValue={firstValue} className="gap-0">
          <div className="max-w-full overflow-x-auto border-b border-border px-3 py-2">
            <TabsList className="h-9">
              {prompts.map((prompt) => (
                <TabsTrigger
                  key={prompt.segmentIndex}
                  value={String(prompt.segmentIndex)}
                  className="min-w-24 px-3"
                >
                  Часть {prompt.segmentIndex}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {prompts.map((prompt) => (
            <TabsContent key={prompt.segmentIndex} value={String(prompt.segmentIndex)} className="p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-md bg-muted px-2 py-1 font-semibold">{prompt.durationSeconds} сек</span>
                <span className="rounded-md bg-muted px-2 py-1 font-semibold">{prompt.role}</span>
                {prompt.referenceUrl ? (
                  <span className="min-w-0 truncate rounded-md bg-muted px-2 py-1">{prompt.referenceUrl}</span>
                ) : null}
              </div>
              <pre className="max-h-80 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-3 text-xs leading-5 text-foreground">
                {prompt.prompt}
              </pre>
              <OmniSegmentPromptDetails
                prompt={prompt.prompt}
                voiceoverText={prompt.voiceoverText}
                storyboardPlan={prompt.storyboardPlan ?? prompt.storyboard_plan}
                storyboardReferenceUrl={prompt.storyboardReferenceUrl ?? prompt.storyboard_reference_url}
                creativeStrategy={prompt.creativeStrategy}
                creativePlan={prompt.creativePlan}
                validation={prompt.validation}
              />
            </TabsContent>
          ))}
        </Tabs>
      ) : null}
    </div>
  );
}

function getPromptErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.error;
    return typeof message === "string" ? message : error.message;
  }
  return error instanceof Error ? error.message : null;
}
