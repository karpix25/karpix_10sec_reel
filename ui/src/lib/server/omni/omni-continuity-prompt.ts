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
  if (images.length < 2) return prompt;
  const labels = images.map((image, index) => `Image ${index + 1}: ${describeReferenceRole(image.role)}`);
  return `${prompt.trim()}\n\nKIE reference image order: ${labels.join("; ")}. Follow the previous frame image for the starting pose and layout. Use the product image as a standalone product reference. Keep the product in its own clear place in the scene, such as on a table, counter, shelf, or in the character's hands when the segment action calls for it.`;
}

function describeReferenceRole(role: string) {
  if (role === "previous_last_frame") return "previous segment final frame for pose, room layout, camera, lighting, and prop positions";
  if (role === "product") return "product reference to preserve product appearance";
  if (role === "avatar") return "avatar reference";
  if (role === "avatar_product_composite") return "combined avatar and product reference";
  return `${role} reference`;
}
