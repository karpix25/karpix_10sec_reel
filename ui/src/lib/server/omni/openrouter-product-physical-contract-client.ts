import { cleanProductPhysicalContract } from "./product-physical-contract";
import {
  buildProductPhysicalContractUserPrompt,
  PRODUCT_PHYSICAL_CONTRACT_SYSTEM_PROMPT,
} from "./product-physical-contract-prompt";
import type { ProductVisualProfile } from "./product-visual-profile";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-flash";

export async function generateProductPhysicalContractText(input: {
  productName?: string | null;
  description?: string | null;
  productReferenceNotes?: string | null;
  productVisualProfile?: ProductVisualProfile | null;
  userInstruction?: string | null;
  model?: string | null;
}) {
  const apiKey = process.env.OPENROUTER_API_KEY || "";
  if (!apiKey.trim()) throw new Error("OPENROUTER_API_KEY is not configured");

  const model = input.model || process.env.OMNI_PRODUCT_PHYSICAL_CONTRACT_MODEL || DEFAULT_MODEL;
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://n8n-omnireels.ap2dy7.easypanel.host",
      "X-Title": "Omni Reels Product Physical Contract",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: PRODUCT_PHYSICAL_CONTRACT_SYSTEM_PROMPT },
        { role: "user", content: buildProductPhysicalContractUserPrompt(input) },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Product physical contract request failed: ${response.status} ${text.slice(0, 240)}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const contract = cleanProductPhysicalContract(readAssistantContent(data).replace(/^PRODUCT PHYSICAL CONTRACT:\s*/iu, ""));
  if (!contract) throw new Error("Product physical contract model returned empty content");
  return { contract, model: String(data.model || model) };
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
  throw new Error("Product physical contract model returned empty content");
}
