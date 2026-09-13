import {
  buildProductBrollAction,
  buildProductBrollPlacement,
} from "./omni-product-broll-contract";

export function buildDigitalProductDemoStep(input: {
  productName: string;
  frameIndex: number;
  frameCount: number;
  noPeopleReference?: boolean;
}) {
  const product = input.productName.trim() || "мобильный продукт";
  return {
    action: buildProductBrollAction(product, true),
    placement: buildProductBrollPlacement(product, true),
  };
}
