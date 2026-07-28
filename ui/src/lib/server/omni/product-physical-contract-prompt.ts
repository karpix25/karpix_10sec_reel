import type { ProductVisualProfile } from "./product-visual-profile";
import { renderProductVisualProfileSummary } from "./product-visual-profile";

export const PRODUCT_PHYSICAL_CONTRACT_PROMPT_VERSION = "product-physical-contract-v1";

export const PRODUCT_PHYSICAL_CONTRACT_SYSTEM_PROMPT = [
  "You write compact physical behavior contracts for AI video generation.",
  "Use positive target-state instructions first: what the product remains, how it moves, how it keeps shape, and how it settles.",
  "Use the product description, notes, and user instruction as the source of truth for material and consistency.",
  "Use image analysis only for visible traits such as shape, surface, color, package, transparency, and finish.",
  "Do not infer hidden physical behavior from a photo alone.",
  "Do not build a product catalog and do not use hardcoded presets.",
  "End with one short critical drift guard, not a long negative blacklist.",
  "Return only the contract text. No markdown, headings, JSON, bullets, or explanations.",
].join("\n");

export function buildProductPhysicalContractUserPrompt(input: {
  productName?: string | null;
  description?: string | null;
  productReferenceNotes?: string | null;
  productVisualProfile?: ProductVisualProfile | null;
  userInstruction?: string | null;
}) {
  return [
    "Write one reusable provider-facing physical behavior contract for this product.",
    "Keep it 2-4 concise sentences.",
    "",
    "Product context:",
    `Name: ${cleanText(input.productName) || "Not provided."}`,
    `Description: ${cleanText(input.description) || "Not provided."}`,
    `Reference notes: ${cleanText(input.productReferenceNotes) || "Not provided."}`,
    `User physical instruction: ${cleanText(input.userInstruction) || "Not provided."}`,
    `Visible product passport: ${renderProductVisualProfileSummary(input.productVisualProfile || null) || "Not provided."}`,
    "",
    "Contract shape:",
    "Sentence 1: the stable target state the product remains throughout the video.",
    "Sentence 2: the visible physical traits and allowed motion/deformation.",
    "Sentence 3: how it returns to or preserves its stable shape/design.",
    "Final short sentence: critical drift guard.",
  ].join("\n");
}

function cleanText(value: string | null | undefined) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}
