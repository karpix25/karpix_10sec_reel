import { Coins } from "lucide-react";
import type { OmniGenerationCostSummary } from "@/lib/omni/generation-cost";
import { formatOpenRouterUsd } from "@/lib/omni/openrouter-cost";

export function GenerationCostBadge({ summary }: { summary: OmniGenerationCostSummary }) {
  const parts = [
    summary.openRouterUsd === null ? null : `LLM ${formatOpenRouterUsd(summary.openRouterUsd)}`,
    summary.kieCredits ? `KIE ${summary.kieCredits} кр.` : null,
  ].filter(Boolean);
  const attempts = [
    summary.storyboard.attempts ? `${summary.storyboard.attempts} раскадр.` : null,
    summary.video.attempts ? `${summary.video.attempts} видео` : null,
  ].filter(Boolean);
  const prefix = summary.totalIsEstimated ? "≈ " : "";

  return (
    <div
      className="shrink-0 rounded-lg border border-primary/15 bg-background px-3 py-2 text-right shadow-sm"
      title={`Расходы: ${parts.join(" · ") || "ожидаю данные"}${attempts.length ? `; ${attempts.join(" · ")}` : ""}`}
    >
      <div className="flex items-center justify-end gap-1.5 text-xs font-semibold text-primary">
        <Coins className="h-3.5 w-3.5" />
        <span>{prefix}{formatOpenRouterUsd(summary.totalUsd)}</span>
      </div>
      <p className="mt-0.5 whitespace-nowrap text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        итого
      </p>
      <p className="mt-0.5 max-w-40 truncate text-[11px] text-muted-foreground">
        {parts.join(" · ") || "ожидаю списание"}
      </p>
    </div>
  );
}
