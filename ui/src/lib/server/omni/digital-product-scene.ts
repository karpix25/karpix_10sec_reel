export function buildDigitalProductDemoStep(input: {
  productName: string;
  frameIndex: number;
  frameCount: number;
  noPeopleReference?: boolean;
}) {
  const product = input.productName.trim() || "мобильный продукт";
  const revealFrame = input.frameCount >= 5 ? 3 : Math.max(2, Math.ceil(input.frameCount / 2));
  if (input.noPeopleReference) {
    const placement = `утвержденный экран ${product} занимает главный визуальный фокус; показывается как чистая демонстрация интерфейса без телефона в руке и без людей`;
    return input.frameIndex < revealFrame
      ? {
          action: `самостоятельный атмосферный B-roll по реплике; экран ${product} пока вне кадра, людей и рук нет`,
          placement: `${product} вне кадра до утвержденного момента появления`,
        }
      : {
          action: `короткая чистая вставка интерфейса: утвержденный экран ${product} появляется крупно в соответствующей B-roll композиции, без людей и рук`,
          placement,
        };
  }
  const placement = `${product} показывается на экране смартфона: герой естественно держит смартфон вертикально одной рукой на уровне груди, экран повернут к камере, контакт только с ладонью и пальцами`;

  if (input.frameIndex < revealFrame) {
    return {
      action: `B-roll по реплике; герой молча и естественно жестикулирует, смартфон с экраном ${product} пока вне кадра`,
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
