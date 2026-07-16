import { Coins, Loader2 } from "lucide-react";
import {
  formatOpenRouterTokens,
  formatOpenRouterUsd,
  type OpenRouterCostSummary,
} from "@/lib/omni/openrouter-cost";

export function OpenRouterCostBadge({
  summary,
  pending = false,
}: {
  summary?: OpenRouterCostSummary | null;
  pending?: boolean;
}) {
  const exactCost = summary?.costUsd ?? null;
  const displayCost = exactCost ?? summary?.estimatedCostUsd ?? null;
  const sourceLabel = exactCost === null && summary?.estimatedCostUsd !== null ? "оценка" : "OpenRouter";

  return (
    <div className="shrink-0 rounded-lg border border-primary/15 bg-background px-3 py-2 text-right shadow-sm">
      <div className="flex items-center justify-end gap-1.5 text-xs font-semibold text-primary">
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Coins className="h-3.5 w-3.5" />}
        <span>{pending ? "считаю $" : formatOpenRouterUsd(displayCost)}</span>
      </div>
      <p className="mt-0.5 whitespace-nowrap text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        {pending ? "tokens pending" : sourceLabel}
      </p>
      {!pending && summary ? (
        <p className="mt-0.5 whitespace-nowrap text-[11px] text-muted-foreground">
          in {formatOpenRouterTokens(summary.promptTokens)} / out {formatOpenRouterTokens(summary.completionTokens)}
        </p>
      ) : null}
    </div>
  );
}
