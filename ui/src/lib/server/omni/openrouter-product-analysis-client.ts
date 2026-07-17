import { normalizeOpenRouterUsage, type OpenRouterUsageRecord } from "@/lib/omni/openrouter-cost";
import { getOpenRouterPricingSnapshot } from "./openrouter-pricing";
import { parseAndRepairJson } from "./script-json-repair";
import {
  normalizeProductVisualProfile,
  type ProductVisualProfile,
} from "./product-visual-profile";
import {
  buildProductAnalysisUserPrompt,
  PRODUCT_ANALYSIS_SYSTEM_PROMPT,
} from "./product-analysis-prompt";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_DIRECTOR_MODEL = "minimax/minimax-m3";

export type ProductReferenceAnalysisResult = {
  profile: ProductVisualProfile;
  model: string;
  responseMetadata: Record<string, unknown>;
  openRouterUsage: OpenRouterUsageRecord | null;
};

export type ProductReferenceImageInput = string | { url?: string | null };

export async function analyzeProductReferenceImages(input: {
  imageUrls?: string[];
  references?: ProductReferenceImageInput[];
  productName?: string | null;
  description?: string | null;
  productDescription?: string | null;
  notes?: string | null;
  productReferenceNotes?: string | null;
  model?: string | null;
}): Promise<ProductReferenceAnalysisResult> {
  const apiKey = process.env.OPENROUTER_API_KEY || "";
  if (!apiKey.trim()) throw new Error("OPENROUTER_API_KEY is not configured");

  const imageUrls = normalizeImageUrls(input.imageUrls, input.references);
  if (!imageUrls.length) throw new Error("Product reference analysis requires at least one image URL");

  const description = input.description ?? input.productDescription;
  const notes = input.notes ?? input.productReferenceNotes;
  const model = input.model || process.env.OMNI_DIRECTOR_ANALYSIS_MODEL || DEFAULT_DIRECTOR_MODEL;
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://n8n-omnireels.ap2dy7.easypanel.host",
      "X-Title": "Omni Reels Product Reference Analysis",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: PRODUCT_ANALYSIS_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: buildProductAnalysisUserPrompt({
                productName: input.productName,
                description,
                notes,
                imageCount: imageUrls.length,
              }),
            },
            ...imageUrls.map((url) => ({ type: "image_url", image_url: { url } })),
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Product reference analysis model request failed: ${response.status} ${text.slice(0, 240)}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const content = readAssistantContent(data);
  const parsed = parseAndRepairJson(content) as unknown;
  const profile = normalizeProductVisualProfile(parsed);
  if (!profile) throw new Error("Product reference analysis model returned invalid product_visual_profile JSON");

  const responseModel = String(data.model || model);
  const pricing = await getOpenRouterPricingSnapshot(responseModel);
  const openRouterUsage = normalizeOpenRouterUsage({
    layer: "product_analysis",
    model,
    response: data,
    pricing,
  });

  return {
    profile,
    model: responseModel,
    responseMetadata: {
      id: data.id || null,
      model: responseModel,
      usage: data.usage || null,
      openrouter_usage: openRouterUsage,
    },
    openRouterUsage,
  };
}

function normalizeImageUrls(imageUrls?: string[], references?: ProductReferenceImageInput[]) {
  const referenceUrls = references?.map((reference) => {
    if (typeof reference === "string") return reference;
    return reference.url || "";
  });
  return [...(imageUrls || []), ...(referenceUrls || [])].map((url) => url.trim()).filter(Boolean);
}

function readAssistantContent(data: Record<string, unknown>) {
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const firstChoice = choices[0];
  const message = firstChoice && typeof firstChoice === "object" && !Array.isArray(firstChoice)
    ? (firstChoice as Record<string, unknown>).message
    : null;
  if (message && typeof message === "object" && !Array.isArray(message)) {
    const content = (message as Record<string, unknown>).content;
    if (typeof content === "string") return content;
  }
  throw new Error("Product reference analysis model returned empty content");
}
