export const OMNI_PRODUCT_BROLL_RULE =
  "PRODUCT B-ROLL: продукт показывается отдельной предметной вставкой без людей, рук, лица, тела и любого взаимодействия; меняются только ракурс или фокус камеры, сам продукт остается неподвижным на устойчивой поверхности.";

export const OMNI_PRODUCT_BROLL_WARDROBE =
  "WARDROBE: not applicable; product-only B-roll has no person or hands.";

export function buildProductBrollAction(productName: string, digital = false) {
  const product = productName.trim() || "продукт";
  return digital
    ? `самостоятельная предметная B-roll вставка: утвержденный экран ${product} показан на смартфоне, который лежит экраном вверх на устойчивой поверхности; без людей и рук`
    : `самостоятельная предметная B-roll вставка: утвержденный продукт ${product} стоит на устойчивой поверхности; камера делает спокойный предметный ракурс, без людей и рук`;
}

export function buildProductBrollPlacement(productName: string, digital = false) {
  const product = productName.trim() || "продукт";
  return digital
    ? `${product} показан только на утвержденном экране смартфона; смартфон лежит экраном вверх на устойчивой поверхности; без людей, рук и взаимодействия`
    : `${product} стоит на одной устойчивой поверхности; контактные тени и перспектива сохранены; без людей, рук и взаимодействия`;
}

export function buildProductBrollCamera() {
  return "самостоятельный крупный предметный B-roll ракурс продукта на устойчивой поверхности; без людей и рук";
}
