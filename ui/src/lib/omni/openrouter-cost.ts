export type OpenRouterUsageLayer = "director_analysis" | "script_writer";

export type OpenRouterPricingSnapshot = {
  source: "openrouter_models_api";
  model: string;
  checkedAt: string;
  promptUsdPerToken: number | null;
  completionUsdPerToken: number | null;
  requestUsd: number | null;
  imageUsd: number | null;
  internalReasoningUsdPerToken: number | null;
  inputCacheReadUsdPerToken: number | null;
  inputCacheWriteUsdPerToken: number | null;
};

export type OpenRouterUsageRecord = {
  layer: OpenRouterUsageLayer;
  label: string;
  model: string;
  generationId: string | null;
  attempt: number | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  reasoningTokens: number | null;
  cachedPromptTokens: number | null;
  costUsd: number | null;
  upstreamInferenceCostUsd: number | null;
  costSource: "openrouter_usage" | "openrouter_models_api_estimate" | "none";
  pricing: OpenRouterPricingSnapshot | null;
};

export type OpenRouterCostSummary = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number | null;
  estimatedCostUsd: number | null;
  layers: OpenRouterUsageRecord[];
};

export function normalizeOpenRouterUsage(input: {
  layer: OpenRouterUsageLayer;
  model: string;
  response: Record<string, unknown>;
  attempt?: number | null;
  pricing?: OpenRouterPricingSnapshot | null;
}): OpenRouterUsageRecord {
  const usage = readRecord(input.response.usage);
  const promptTokens = readNumber(usage?.prompt_tokens) ?? 0;
  const completionTokens = readNumber(usage?.completion_tokens) ?? 0;
  const totalTokens = readNumber(usage?.total_tokens) ?? promptTokens + completionTokens;
  const exactCost = readNumber(usage?.cost);
  const pricingEstimate = estimateCostFromPricing({
    promptTokens,
    completionTokens,
    pricing: input.pricing ?? null,
  });
  const costDetails = readRecord(usage?.cost_details);
  const promptDetails = readRecord(usage?.prompt_tokens_details);
  const completionDetails = readRecord(usage?.completion_tokens_details);

  return {
    layer: input.layer,
    label: getOpenRouterLayerLabel(input.layer),
    model: String(input.response.model || input.model),
    generationId: typeof input.response.id === "string" ? input.response.id : null,
    attempt: input.attempt ?? null,
    promptTokens,
    completionTokens,
    totalTokens,
    reasoningTokens:
      readNumber(usage?.reasoning_tokens) ??
      readNumber(completionDetails?.reasoning_tokens) ??
      readNumber(usage?.internal_reasoning_tokens) ??
      null,
    cachedPromptTokens:
      readNumber(promptDetails?.cached_tokens) ??
      readNumber(promptDetails?.cache_read_tokens) ??
      readNumber(usage?.cache_read_tokens) ??
      null,
    costUsd: exactCost ?? pricingEstimate,
    upstreamInferenceCostUsd: readNumber(costDetails?.upstream_inference_cost),
    costSource: exactCost !== null ? "openrouter_usage" : pricingEstimate !== null ? "openrouter_models_api_estimate" : "none",
    pricing: input.pricing ?? null,
  };
}

export function summarizeOpenRouterUsage(records: OpenRouterUsageRecord[]): OpenRouterCostSummary {
  const layers = records.filter((record) => record.totalTokens > 0 || record.costUsd !== null);
  const promptTokens = layers.reduce((sum, record) => sum + record.promptTokens, 0);
  const completionTokens = layers.reduce((sum, record) => sum + record.completionTokens, 0);
  const totalTokens = layers.reduce((sum, record) => sum + record.totalTokens, 0);
  const exactCosts = layers.filter((record) => record.costSource === "openrouter_usage" && record.costUsd !== null);
  const allCosts = layers.filter((record) => record.costUsd !== null);

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    costUsd: exactCosts.length ? sumCosts(exactCosts) : null,
    estimatedCostUsd: allCosts.length ? sumCosts(allCosts) : null,
    layers,
  };
}

export function extractOpenRouterCostSummaryFromSnapshot(snapshot: unknown): OpenRouterCostSummary | null {
  const record = readRecord(snapshot);
  if (!record) return null;
  const storedSummary = readRecord(record.openrouter_cost);
  const storedLayers = Array.isArray(storedSummary?.layers)
    ? storedSummary?.layers
    : Array.isArray(record.openrouter_usage)
      ? record.openrouter_usage
      : [];
  const layers = storedLayers.map(normalizeStoredUsageRecord).filter(Boolean) as OpenRouterUsageRecord[];
  if (!layers.length) return null;
  return summarizeOpenRouterUsage(layers);
}

export function formatOpenRouterUsd(value: number | null | undefined) {
  if (value === null || value === undefined) return "считаю";
  if (value === 0) return "$0";
  if (value < 0.0001) return `$${value.toFixed(6)}`;
  if (value < 0.01) return `$${value.toFixed(5)}`;
  return `$${value.toFixed(4)}`;
}

export function formatOpenRouterTokens(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return String(value);
}

export function getOpenRouterLayerLabel(layer: OpenRouterUsageLayer) {
  if (layer === "director_analysis") return "Режиссёрский анализ";
  return "Сценарист";
}

function normalizeStoredUsageRecord(value: unknown): OpenRouterUsageRecord | null {
  const record = readRecord(value);
  if (!record) return null;
  const layer = record.layer === "director_analysis" ? "director_analysis" : "script_writer";
  const pricing = readRecord(record.pricing) as OpenRouterPricingSnapshot | null;
  return {
    layer,
    label: typeof record.label === "string" ? record.label : getOpenRouterLayerLabel(layer),
    model: typeof record.model === "string" ? record.model : "unknown",
    generationId: typeof record.generationId === "string" ? record.generationId : null,
    attempt: readNumber(record.attempt),
    promptTokens: readNumber(record.promptTokens) ?? 0,
    completionTokens: readNumber(record.completionTokens) ?? 0,
    totalTokens: readNumber(record.totalTokens) ?? 0,
    reasoningTokens: readNumber(record.reasoningTokens),
    cachedPromptTokens: readNumber(record.cachedPromptTokens),
    costUsd: readNumber(record.costUsd),
    upstreamInferenceCostUsd: readNumber(record.upstreamInferenceCostUsd),
    costSource:
      record.costSource === "openrouter_usage" || record.costSource === "openrouter_models_api_estimate"
        ? record.costSource
        : "none",
    pricing,
  };
}

function estimateCostFromPricing(input: {
  promptTokens: number;
  completionTokens: number;
  pricing: OpenRouterPricingSnapshot | null;
}) {
  const { pricing } = input;
  if (!pricing) return null;
  const promptCost = pricing.promptUsdPerToken === null ? null : input.promptTokens * pricing.promptUsdPerToken;
  const completionCost =
    pricing.completionUsdPerToken === null ? null : input.completionTokens * pricing.completionUsdPerToken;
  if (promptCost === null && completionCost === null && pricing.requestUsd === null) return null;
  return (promptCost ?? 0) + (completionCost ?? 0) + (pricing.requestUsd ?? 0);
}

function sumCosts(records: OpenRouterUsageRecord[]) {
  return records.reduce((sum, record) => sum + (record.costUsd ?? 0), 0);
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
