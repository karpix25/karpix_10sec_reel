const PRODUCT_FORM_PATTERN =
  /аэрогрил|бад\b|витамин|добавк|желе|капсул|коллаген|крем|пенк|порошок|продукт|сыворотк|саше|флакон|тюбик|упаковк|баноч|коробк|пакет/iu;

export function mentionsOmniProduct(text: string, productName: string) {
  const normalizedText = normalize(text);
  const productWords = normalize(productName)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 4);
  return (
    productWords.some((word) => normalizedText.includes(word.slice(0, Math.max(4, word.length - 2)))) ||
    PRODUCT_FORM_PATTERN.test(normalizedText)
  );
}

export function isProductPlacementVisible(placement: string, productName: string) {
  const normalized = normalize(placement);
  if (!normalized || /продукт\s+(?:вне\s+кадра|не\s+виден)|hidden|off\s*camera/iu.test(normalized)) return false;
  return mentionsOmniProduct(placement, productName);
}

function normalize(value: string) {
  return value.toLowerCase().replace(/ё/g, "е").replace(/\s+/gu, " ").trim();
}
