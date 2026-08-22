export function buildDigitalProductDemoStep(input: {
  productName: string;
  frameIndex: number;
  frameCount: number;
}) {
  const product = input.productName.trim() || "мобильный продукт";
  const revealFrame = input.frameCount >= 5 ? 3 : Math.max(2, Math.ceil(input.frameCount / 2));
  const placement = `${product} показывается на экране смартфона: герой естественно держит смартфон вертикально одной рукой на уровне груди, экран повернут к камере, контакт только с ладонью и пальцами`;

  if (input.frameIndex < revealFrame) {
    return {
      action: `B-roll по реплике; герой спокойно говорит и жестикулирует, смартфон с экраном ${product} пока вне кадра`,
      placement: `${product} вне кадра до утвержденного момента появления`,
    };
  }
  if (input.frameIndex === revealFrame) {
    return {
      action: `короткая естественная вставка: герой поднимает смартфон в одной руке из нижней части кадра и показывает утвержденный экран ${product}; второй рукой продолжает спокойный жест`,
      placement,
    };
  }
  return {
    action: `герой продолжает держать тот же смартфон одной рукой на уровне груди, экран ${product} остается повернут к камере; второй рукой делает естественный жест`,
    placement,
  };
}
