export function buildDigitalProductDemoStep(input: {
  productName: string;
  frameIndex: number;
  frameCount: number;
}) {
  const product = input.productName.trim() || "мобильный продукт";
  const revealFrame = input.frameCount >= 5 ? 3 : Math.max(2, Math.ceil(input.frameCount / 2));
  const placement = "смартфон с утвержденным экраном мобильного продукта лежит или находится в руке; без пластиковой карты и упаковки";

  if (input.frameIndex < revealFrame) {
    return {
      action: `B-roll по реплике; ${product} пока вне кадра`,
      placement: `${product} вне кадра до утвержденного момента появления`,
    };
  }
  if (input.frameIndex === revealFrame) {
    return {
      action: `короткая вставка: смартфон показывает утвержденный экран ${product}; экран появляется через видимое движение телефона, без физической карты`,
      placement,
    };
  }
  return {
    action: `продолжение независимой B-roll сцены с тем же смартфоном и утвержденным экраном ${product}; без пластиковой карты`,
    placement,
  };
}
