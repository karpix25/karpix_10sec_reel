import { getOmniImageReferenceTag } from "./storyboard/omni-storyboard-file-reference";

const CONTINUITY_PROMPT_CONTRACT = [
  "Start this segment directly from the final pose and layout shown in the provided previous-frame reference.",
  "Maintain the same person, clothing, camera distance, lighting, room background, and visible prop positions.",
  "Keep products and props in the same visual relationship to the speaker unless this segment explicitly moves them.",
  "Let the speaker continue naturally with blinking, speech, and small gestures from the starting posture.",
  "Do not create a sudden camera cut, angle change, lighting change, background reset, or new outfit at the transition boundary.",
].join(" ");

export function appendContinuityPromptContract(prompt: string) {
  return `${prompt.trim()}\n\nContinuity from previous segment: ${CONTINUITY_PROMPT_CONTRACT}`;
}

export function appendKieReferenceOrderPrompt(
  prompt: string,
  images: { role: string }[]
) {
  if (!images.length) return prompt;
  const references = images.map((image, index) => ({
    declaration: `${getOmniImageReferenceTag(index)}@Image${index + 1}`,
    label: `${getOmniImageReferenceTag(index)}: ${describeReferenceRole(image.role)}`,
  }));
  const hasPreviousFrame = images.some((image) => image.role === "previous_last_frame");
  const hasStoryboard = images.some((image) => image.role === "storyboard");
  const hasProduct = images.some((image) => image.role === "product" || image.role === "product_secondary");
  return [
    `[# References\n${references.map((reference) => reference.declaration).join("\n")}\n]`,
    "REFERENCE MANIFEST:",
    references.map((reference) => reference.label).join("\n"),
    "Use the supplied images as visual references, not as literal initial frames.",
    hasStoryboard
      ? "The storyboard is one ordered instruction board. Follow its panels in the timestamped order below, but never render the board grid, separators, panel labels, or instruction strips in the video."
      : "",
    hasPreviousFrame ? "Follow the previous frame image for the starting pose and layout." : "",
    hasStoryboard
      ? "STORYBOARD AUTHORITY: preserve its composition, PIP or collage layout, wardrobe, lighting, decor, camera relationship, product placement, and edit rhythm. Adapt only the performer identity and the supplied product."
      : "",
    hasProduct
      ? "Use the product image as the exact standalone source of truth for product appearance: package shape, label layout, cap or lid color, color palette, size, material, and printed details. The product reference must not define the character outfit, face, room, camera gear, or unrelated props. Keep the product in its own clear place in the scene, such as on a table, counter, shelf, or in the character's hands only when the segment action calls for it."
      : "",
    "",
    prompt.trim(),
  ].filter(Boolean).join("\n");
}

function describeReferenceRole(role: string) {
  if (role === "previous_last_frame") return "previous segment final frame for pose, room layout, camera, lighting, and prop positions";
  if (role === "storyboard") return "single storyboard instruction board for composition, timing, character continuity, product placement, and visual actions";
  if (role === "storyboard_canonical") return "first storyboard reference as canonical outfit, exact clothing colors and fabric; use it for continuity only, not for speech or current actions";
  if (role === "product") return "product reference to preserve product appearance";
  if (role === "product_secondary") return "additional product reference to preserve product appearance";
  if (role === "avatar") return "avatar reference";
  if (role === "avatar_product_composite") return "combined avatar and product reference";
  return `${role} reference`;
}
