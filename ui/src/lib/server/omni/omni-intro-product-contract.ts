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
  if (!normalized || /(?:продукт|товар)\s+(?:вне\s+кадра|не\s+виден|скрыт)|hidden|off\s*camera/iu.test(normalized)) return false;
  return mentionsOmniProduct(placement, productName);
}

export function isProductVisibleInStoryboardFrame(
  frame: Record<string, unknown>,
  productName: string
) {
  const spokenText = String(frame.spokenText || frame.spoken_text || frame.spokenWords || frame.spoken_words || "");
  const placement = String(frame.productPlacement || frame.product_placement || "");
  return mentionsOmniProduct(spokenText, productName) && isProductPlacementVisible(placement, productName);
}

export function hasProductVisibleStoryboardFrame(storyboard: unknown, productName: string) {
  const candidate = storyboard && typeof storyboard === "object" ? storyboard as Record<string, unknown> : null;
  const frames = Array.isArray(storyboard)
    ? storyboard
    : Array.isArray(candidate?.frames)
      ? candidate.frames
      : Array.isArray(candidate?.storyboardFrames)
        ? candidate.storyboardFrames
        : Array.isArray(candidate?.storyboard_frames)
          ? candidate.storyboard_frames
          : [];
  return frames.some((frame) => frame && typeof frame === "object" && isProductVisibleInStoryboardFrame(frame as Record<string, unknown>, productName));
}

function normalize(value: string) {
  return value.toLowerCase().replace(/ё/g, "е").replace(/\s+/gu, " ").trim();
}
