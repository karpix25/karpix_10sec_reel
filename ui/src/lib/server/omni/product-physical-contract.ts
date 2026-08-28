const OMNI_CONTRACT_MARKER = "PRODUCT PHYSICAL CONTRACT:";
const MAX_CONTRACT_LENGTH = 1200;
const MAX_STORYBOARD_HINT_LENGTH = 360;

export function resolveProductPhysicalContract(input: {
  product: { product_physical_contract?: string | null };
  generatedScript?: { product_snapshot?: unknown } | null;
}) {
  return cleanProductPhysicalContract(input.product.product_physical_contract) ||
    extractProductPhysicalContractFromSnapshot(input.generatedScript?.product_snapshot);
}

export function cleanProductPhysicalContract(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .replace(new RegExp(OMNI_CONTRACT_MARKER, "giu"), "")
    .replace(/```(?:text)?/giu, "")
    .replace(/```/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CONTRACT_LENGTH)
    .trim();
}

export function renderProductPhysicalContractForOmni(contract: string | null | undefined) {
  const clean = cleanProductPhysicalContract(contract);
  if (!clean) return "";
  return [
    OMNI_CONTRACT_MARKER,
    clean,
    "Stable product state: keep the stated material, consistency, visible contents, package shape, label layout, colors, scale, shadows, and highlights continuous from the first frame to the last frame.",
    "Motion behavior: the product moves only through visible hand contact, gravity, or camera movement while preserving the same physical form and reference design.",
    "This contract is mandatory whenever the product appears in motion.",
  ].join(" ");
}

export function renderProductPhysicalHintForStoryboard(contract: string | null | undefined) {
  const clean = cleanProductPhysicalContract(contract);
  if (!clean) return "";
  const positiveState = clean.split(/critical\s+drift\s+guard\s*:/iu)[0].trim() || clean;
  return `физическое состояние продукта: ${compactText(positiveState, MAX_STORYBOARD_HINT_LENGTH)}`;
}

export const renderProductPhysicalStoryboardHint = renderProductPhysicalHintForStoryboard;

export function extractProductPhysicalContractFromSnapshot(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return "";
  const record = snapshot as Record<string, unknown>;
  return cleanProductPhysicalContract(
    record.product_physical_contract ??
      record.physical_contract ??
      record.productPhysicalContract
  );
}

function compactText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  const clipped = value.slice(0, maxLength).replace(/\s+\S*$/u, "").trim();
  return clipped || value.slice(0, maxLength).trim();
}
