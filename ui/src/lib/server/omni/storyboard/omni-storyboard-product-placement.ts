import type { OmniSegmentCreativePlan } from "../../../omni/creative-contract";
import {
  renderRequiredReferenceSupport,
  type ReferenceTransferFramePlan,
} from "../omni-reference-transfer-policy";

export function renderStoryboardProductPlacement(
  plan: OmniSegmentCreativePlan,
  productName: string,
  productVisualPassport?: string | null,
  productPhysicalHint?: string | null,
  productVisible = false,
  referenceTransfer?: ReferenceTransferFramePlan,
  physicalDemoPlacement?: string
) {
  const support = renderRequiredReferenceSupport(referenceTransfer);
  const productDetails = productVisualPassport ? `, детали из референса: ${compactProductReference(productVisualPassport)}` : "";
  if (plan.productRole === "hidden") return ["продукт вне кадра в этом сегменте", support].filter(Boolean).join("; ");
  if (!productVisible) return ["в кадре тематические объекты и окружение текущей реплики", support].filter(Boolean).join("; ");

  if (physicalDemoPlacement && plan.productRole !== "digital_demo") {
    return [
      physicalDemoPlacement,
      "это единственный физический показ продукта в ролике; не добавлять другой продукт или упаковку",
      support,
    ].filter(Boolean).join("; ");
  }

  if (plan.productRole === "digital_demo") {
    return [
      physicalDemoPlacement || `${productName} показывается на экране смартфона, который герой естественно держит в руке`,
      "это мобильное приложение, не пластиковая карта и не упаковка",
      support,
    ].filter(Boolean).join("; ");
  }

  const placement = plan.productRole === "background_prop"
    ? `${productName} может быть виден только как небольшой вспомогательный предмет: стоит на поверхности в блогерской сцене, без крупного рекламного плана и без демонстрации этикетки${productDetails}`
    : plan.productRole === "brief_demo"
      ? `${productName} обязательно физически виден в коротком действии с рукой${productDetails}`
      : plan.productRole === "natural_use"
        ? `${productName} обязательно физически виден и используется как естественный предмет сцены${productDetails}`
        : `${productName} обязательно физически виден как реальный предмет в окружении${productDetails}`;
  return appendProductPhysicalHint([placement, support].filter(Boolean).join("; "), productPhysicalHint);
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
