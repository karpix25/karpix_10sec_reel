export const OMNI_STORYBOARD_FILE_PLACEHOLDER = "@storyboard_file";
export const OMNI_PRODUCT_FILE_PLACEHOLDER = "@product_file";

export function getOmniImageReferenceTag(index: number) {
  return `<IMAGE_REF_${index}>`;
}

export function resolveOmniStoryboardFileReference(images: readonly { role: string }[]) {
  const index = images.findIndex((image) => image.role === "storyboard");
  return index >= 0 ? getOmniImageReferenceTag(index) : OMNI_STORYBOARD_FILE_PLACEHOLDER;
}

export function resolveOmniProductFileReference(images: readonly { role: string }[]) {
  const index = images.findIndex((image) => image.role === "product");
  return index >= 0 ? getOmniImageReferenceTag(index) : OMNI_PRODUCT_FILE_PLACEHOLDER;
}

export function applyOmniStoryboardFileReference(
  prompt: string,
  images: readonly { role: string }[]
) {
  return prompt
    .replaceAll(OMNI_STORYBOARD_FILE_PLACEHOLDER, resolveOmniStoryboardFileReference(images))
    .replaceAll(OMNI_PRODUCT_FILE_PLACEHOLDER, resolveOmniProductFileReference(images));
}
