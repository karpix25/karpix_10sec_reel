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
  const labels = images.map((image, index) => `Image ${index + 1}: ${describeReferenceRole(image.role)}`);
  const hasPreviousFrame = images.some((image) => image.role === "previous_last_frame");
  const hasProduct = images.some((image) => image.role === "product" || image.role === "product_secondary");
  return [
    prompt.trim(),
    "",
    `KIE reference image order: ${labels.join("; ")}.`,
    hasPreviousFrame ? "Follow the previous frame image for the starting pose and layout." : "",
    hasProduct
      ? "Use the product image as the exact standalone source of truth for product appearance: package shape, label layout, cap or lid color, color palette, size, material, and printed details. The product reference must not define the character outfit, face, room, camera gear, or unrelated props. Keep the product in its own clear place in the scene, such as on a table, counter, shelf, or in the character's hands only when the segment action calls for it."
      : "",
  ].filter(Boolean).join(" ");
}

function describeReferenceRole(role: string) {
  if (role === "previous_last_frame") return "previous segment final frame for pose, room layout, camera, lighting, and prop positions";
  if (role === "product") return "product reference to preserve product appearance";
  if (role === "product_secondary") return "additional product reference to preserve product appearance";
  if (role === "avatar") return "avatar reference";
  if (role === "avatar_product_composite") return "combined avatar and product reference";
  return `${role} reference`;
}
