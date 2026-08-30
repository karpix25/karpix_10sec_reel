import type { OmniSegmentCreativePlan } from "../../../omni/creative-contract";
import {
  renderRequiredReferenceSupport,
  type ReferenceTransferFramePlan,
} from "../omni-reference-transfer-policy";
import { buildProductBrollPlacement } from "../omni-product-broll-contract";

export function renderStoryboardProductPlacement(
  plan: OmniSegmentCreativePlan,
  productName: string,
  productVisualPassport?: string | null,
  productPhysicalHint?: string | null,
  productVisible = false,
  referenceTransfer?: ReferenceTransferFramePlan
) {
  const support = renderRequiredReferenceSupport(referenceTransfer);
  const productDetails = productVisualPassport ? `, детали из референса: ${compactProductReference(productVisualPassport)}` : "";
  if (plan.productRole === "hidden") return ["продукт вне кадра в этом сегменте", support].filter(Boolean).join("; ");
  if (!productVisible) return ["в кадре тематические объекты и окружение текущей реплики", support].filter(Boolean).join("; ");

  const placement = buildProductBrollPlacement(productName, plan.productRole === "digital_demo");
  return appendProductPhysicalHint([placement, productDetails, support].filter(Boolean).join("; "), productPhysicalHint);
}

function appendProductPhysicalHint(base: string, productPhysicalHint?: string | null) {
  const hint = productPhysicalHint?.trim();
  return hint ? `${base}; ${hint}` : base;
}

function compactProductReference(value: string) {
  const lines = value.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const preferredLabels = ["Prompt summary", "Must preserve", "Physical form", "Exact visible colors", "Materials and finish"];
  const preferred = preferredLabels
    .map((label) => lines.find((line) => new RegExp(`^-\\s*${label}:`, "iu").test(line)) || "")
    .map((line) => line.replace(/^-\s*[^:]+:\s*/u, ""))
    .find(Boolean);
  return compactText(preferred || value, 160);
}

function compactText(value: string, maxLength: number) {
  const cleaned = value.replace(/\s+/gu, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  const clipped = cleaned.slice(0, maxLength).replace(/\s+\S*$/u, "").trim();
  return clipped || cleaned.slice(0, maxLength).trim();
}
