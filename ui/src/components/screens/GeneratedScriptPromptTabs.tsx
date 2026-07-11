"use client";

import { Loader2, WandSparkles } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOmniGeneratedScriptPrompts } from "@/hooks/useOmniStudio";

export function GeneratedScriptPromptTabs({
  projectId,
  productId,
  scriptId,
}: {
  projectId: number | null;
  productId: number | null;
  scriptId: number;
}) {
  const promptsQuery = useOmniGeneratedScriptPrompts(projectId, productId, scriptId);
  const prompts = promptsQuery.data || [];
  const firstValue = prompts[0] ? String(prompts[0].segmentIndex) : "loading";

  return (
    <div className="mt-3 rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <WandSparkles className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Omni prompts</p>
            <p className="truncate text-xs text-muted-foreground">Промты для 10-секундных частей ролика</p>
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
          Собираю prompt preview...
        </div>
      ) : null}

      {promptsQuery.isError ? (
        <div className="px-3 py-4 text-xs leading-5 text-destructive">
          Не удалось собрать prompt preview для этого сценария.
        </div>
      ) : null}

      {prompts.length ? (
        <Tabs defaultValue={firstValue} className="gap-0">
          <div className="overflow-x-auto border-b border-border px-3 py-2">
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
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-xs leading-5 text-foreground">
                {prompt.prompt}
              </pre>
            </TabsContent>
          ))}
        </Tabs>
      ) : null}
    </div>
  );
}
