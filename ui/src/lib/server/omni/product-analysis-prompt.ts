import type { ProductVisualProfile } from "./product-visual-profile";

export const PRODUCT_ANALYSIS_PROMPT_VERSION = "product-visual-profile-v1";

export const PRODUCT_ANALYSIS_SYSTEM_PROMPT = [
  "You are an expert product packaging and physical object visual analyst.",
  "Analyze product reference images together with the supplied product description.",
  "Return only valid JSON. Do not include markdown, prose, comments, or extra keys.",
  "Describe the product as a physical object for video generation: shape, package, color, material, size, label layout, closure, texture, and visual invariants.",
  "Do not invent unreadable label text, logos, claims, ingredients, certificates, or packaging details.",
  "If text is visible but not readable, describe its placement and visual style without guessing exact words.",
].join("\n");

export function buildProductAnalysisUserPrompt(input: {
  productName?: string | null;
  description?: string | null;
  notes?: string | null;
  imageCount?: number | null;
}) {
  return [
    "Analyze the attached product reference image or images.",
    "Use the product description and notes only to clarify what the images show.",
    "Generate a compact product_visual_profile JSON object with exactly these top-level keys:",
    "physical_form, package_type, colors, materials_finish, size_proportions, labels_text_logo_placement, cap_closure_seal, texture, must_preserve, must_not_change, prompt_summary.",
    "",
    "Required JSON shape:",
    JSON.stringify(buildProductVisualProfileSkeleton(), null, 2),
    "",
    "Product context:",
    `Name: ${cleanText(input.productName) || "Not provided."}`,
    `Description: ${cleanText(input.description) || "Not provided."}`,
    `Notes: ${cleanText(input.notes) || "Not provided."}`,
    `Reference image count: ${Number(input.imageCount || 0) || "unknown"}`,
    "",
    "Important constraints:",
    "- Focus only on visible physical product traits and the provided product description.",
    "- Write concise but concrete values that can be reused in a final video provider prompt.",
    "- must_preserve must list details that keep the product recognizable.",
    "- must_not_change must list details the video model must not alter.",
    "- prompt_summary must be one dense provider-facing sentence about the product object.",
  ].join("\n");
}

function buildProductVisualProfileSkeleton(): ProductVisualProfile {
  return {
    physical_form: "",
    package_type: "",
    colors: [""],
    materials_finish: [""],
    size_proportions: "",
    labels_text_logo_placement: "",
    cap_closure_seal: "",
    texture: "",
    must_preserve: [""],
    must_not_change: [""],
    prompt_summary: "",
  };
}

function cleanText(value: string | null | undefined) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}
