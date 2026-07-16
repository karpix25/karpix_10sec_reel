import type { OpenRouterPricingSnapshot } from "@/lib/omni/openrouter-cost";

const OPENROUTER_MODEL_URL = "https://openrouter.ai/api/v1/model";
const CACHE_TTL_MS = 10 * 60 * 1000;

type CacheEntry = {
  expiresAt: number;
  pricing: OpenRouterPricingSnapshot | null;
};

const cache = new Map<string, CacheEntry>();

export async function getOpenRouterPricingSnapshot(model: string): Promise<OpenRouterPricingSnapshot | null> {
  const normalizedModel = model.trim();
  if (!normalizedModel) return null;

  const cached = cache.get(normalizedModel);
  if (cached && cached.expiresAt > Date.now()) return cached.pricing;

  const pricing = await fetchOpenRouterPricing(normalizedModel).catch(() => null);
  cache.set(normalizedModel, { pricing, expiresAt: Date.now() + CACHE_TTL_MS });
  return pricing;
}

async function fetchOpenRouterPricing(model: string): Promise<OpenRouterPricingSnapshot | null> {
  const response = await fetch(`${OPENROUTER_MODEL_URL}/${encodeModelPath(model)}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return null;

  const data = (await response.json()) as Record<string, unknown>;
  const pricing = readRecord(readRecord(data.data)?.pricing ?? data.pricing);
  if (!pricing) return null;

  return {
    source: "openrouter_models_api",
    model,
    checkedAt: new Date().toISOString(),
    promptUsdPerToken: readNumber(pricing.prompt),
    completionUsdPerToken: readNumber(pricing.completion),
    requestUsd: readNumber(pricing.request),
    imageUsd: readNumber(pricing.image),
    internalReasoningUsdPerToken: readNumber(pricing.internal_reasoning),
    inputCacheReadUsdPerToken: readNumber(pricing.input_cache_read),
    inputCacheWriteUsdPerToken: readNumber(pricing.input_cache_write),
  };
}

function encodeModelPath(model: string) {
  return model.split("/").map(encodeURIComponent).join("/");
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
