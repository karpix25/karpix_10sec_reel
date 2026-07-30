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

export function assertOmniIntroWithoutProduct(input: {
  firstSegmentText: string;
  projectName: string;
  productName: string;
}) {
  if (
    mentionsOmniProduct(input.firstSegmentText, input.productName) ||
    mentionsOmniProduct(input.firstSegmentText, input.projectName)
  ) {
    throw new Error(
      "Сценарий отклонен: первая часть должна быть самостоятельным хуком только о проблеме или желаемом результате. Первое упоминание бренда, товара и его формы начинается во второй части."
    );
  }
}

function normalize(value: string) {
  return value.toLowerCase().replace(/ё/g, "е").replace(/\s+/gu, " ").trim();
}
