export type OmniGenerationCostOperation = "storyboard" | "video";

export type OmniGenerationCostEvent = {
  taskId: string;
  operation: OmniGenerationCostOperation;
  status: string;
  creditsConsumed: number | null;
  costUsd: number | null;
  costIsEstimated: boolean;
};

export type OmniGenerationCostBreakdown = {
  attempts: number;
  credits: number;
  costUsd: number | null;
};

export type OmniGenerationCostSummary = {
  totalUsd: number | null;
  totalIsEstimated: boolean;
  openRouterUsd: number | null;
  kieCredits: number;
  pendingKieTasks: number;
  storyboard: OmniGenerationCostBreakdown;
  video: OmniGenerationCostBreakdown;
};

export function summarizeOmniGenerationCosts(input: {
  openRouterUsd: number | null;
  openRouterCostIsEstimated: boolean;
  events: readonly OmniGenerationCostEvent[];
}): OmniGenerationCostSummary {
  const storyboard = summarizeOperation(input.events, "storyboard");
  const video = summarizeOperation(input.events, "video");
  const knownCosts = [input.openRouterUsd, storyboard.costUsd, video.costUsd].filter(
    (value): value is number => value !== null
  );
  const totalUsd = knownCosts.length ? knownCosts.reduce((sum, value) => sum + value, 0) : null;
  const costEvents = input.events.filter((event) => event.costUsd !== null);

  return {
    totalUsd,
    totalIsEstimated:
      (input.openRouterUsd !== null && input.openRouterCostIsEstimated) ||
      costEvents.some((event) => event.costIsEstimated),
    openRouterUsd: input.openRouterUsd,
    kieCredits: storyboard.credits + video.credits,
    pendingKieTasks: input.events.filter((event) => isPendingStatus(event.status)).length,
    storyboard,
    video,
  };
}

function summarizeOperation(
  events: readonly OmniGenerationCostEvent[],
  operation: OmniGenerationCostOperation
): OmniGenerationCostBreakdown {
  const matching = events.filter((event) => event.operation === operation);
  const knownCosts = matching
    .map((event) => event.costUsd)
    .filter((value): value is number => value !== null);

  return {
    attempts: matching.length,
    credits: matching.reduce((sum, event) => sum + (event.creditsConsumed || 0), 0),
    costUsd: knownCosts.length ? knownCosts.reduce((sum, value) => sum + value, 0) : null,
  };
}

function isPendingStatus(status: string) {
  return !["completed", "failed", "error"].includes(status.toLowerCase());
}
