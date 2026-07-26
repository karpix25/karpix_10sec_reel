export const OMNI_STORYBOARD_FILE_PLACEHOLDER = "@storyboard_file";

export function resolveOmniStoryboardFileReference(images: readonly { role: string }[]) {
  const index = images.findIndex((image) => image.role === "storyboard");
  return index >= 0 ? `@file${index + 1}` : OMNI_STORYBOARD_FILE_PLACEHOLDER;
}

export function applyOmniStoryboardFileReference(
  prompt: string,
  images: readonly { role: string }[]
) {
  if (!prompt.includes(OMNI_STORYBOARD_FILE_PLACEHOLDER)) return prompt;
  return prompt.replaceAll(OMNI_STORYBOARD_FILE_PLACEHOLDER, resolveOmniStoryboardFileReference(images));
}
