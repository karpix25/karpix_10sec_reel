import type { ReferenceFormatMode } from "./omni-reference-format-mode";

const CONTINUITY_PROMPT_CONTRACT = [
  "Start this segment directly from the final pose and layout shown in the provided previous-frame reference.",
  "Maintain the same person, camera distance, lighting, room background, and visible prop positions when the storyboard marks them as continuous.",
  "Keep products and props in the same visual relationship to the speaker unless this segment explicitly moves them.",
  "Let the speaker continue naturally with blinking, speech, and small gestures from the starting posture.",
].join(" ");

export function appendContinuityPromptContract(
  prompt: string,
  options: { wardrobeContinuity?: "stable" | "changes_between_cuts" | "not_visible" | "unknown" } = {},
) {
  const wardrobeLine = options.wardrobeContinuity === "stable"
    ? "Keep the exact storyboard outfit at the transition boundary."
    : options.wardrobeContinuity === "changes_between_cuts"
      ? "Use the current storyboard outfit for this interval; a wardrobe change at an analyzed cut is valid."
      : options.wardrobeContinuity === "not_visible"
        ? "Do not invent or validate clothing details that are not visible."
        : "Follow the current storyboard wardrobe; do not infer a global outfit lock from the reference format.";
  return `${prompt.trim()}\n\nContinuity from previous segment: ${CONTINUITY_PROMPT_CONTRACT} ${wardrobeLine}`;
}

export function appendKieReferenceOrderPrompt(
  prompt: string,
  images: { role: string }[],
  referenceFormatMode: ReferenceFormatMode = "continuous_story"
) {
  if (!images.length) return prompt;
  const labels = images.map((image, index) => `Image ${index + 1}: ${describeReferenceRole(image.role)}`);
  const hasPreviousFrame = images.some((image) => image.role === "previous_last_frame");
  const hasProduct = images.some((image) => image.role === "product" || image.role === "product_secondary");
  const hasCanonicalStoryboard = images.some((image) => image.role === "storyboard_canonical");
  const montageReference = referenceFormatMode === "voiceover_montage";
  return [
    prompt.trim(),
    "",
    `KIE reference image order: ${labels.join("; ")}.`,
    hasPreviousFrame
      ? montageReference
        ? "CONTINUITY AUTHORITY: begin from the previous final frame for pose and product placement only; the current storyboard controls the subject and wardrobe for this independent cut."
        : "CONTINUITY AUTHORITY: begin exactly from the previous final frame. It controls the visible person, outfit, hair, camera, lighting, room and prop layout at the cut boundary."
      : "",
    hasCanonicalStoryboard && !montageReference
      ? "WARDROBE AUTHORITY: copy the exact outfit, color, fabric, fit, sleeves, glasses, and accessories from the canonical storyboard reference. It overrides the current storyboard, avatar, and model guesses for character appearance."
      : images.some((image) => image.role === "storyboard")
      ? montageReference
        ? "IDENTITY AUTHORITY: use the storyboard reference for the current independent cut's composition, face, hair, and product placement. Do not copy wardrobe or room continuity from an unrelated segment."
        : "WARDROBE AUTHORITY: copy the exact outfit, color, fabric, fit, sleeves, and accessories shown in the storyboard reference. The storyboard outfit overrides avatar or model guesses."
      : "",
    hasProduct
      ? "Use the product image as the exact standalone source of truth for product appearance: package shape, label layout, cap or lid color, color palette, size, material, and printed details. The product reference must not define the character outfit, face, room, camera gear, or unrelated props. Keep the product in its own clear place in the scene, such as on a table, counter, shelf, or in the character's hands only when the segment action calls for it."
      : "",
  ].filter(Boolean).join(" ");
}

function describeReferenceRole(role: string) {
  if (role === "previous_last_frame") return "previous segment final frame for pose, room layout, camera, lighting, and prop positions";
  if (role === "storyboard") return "storyboard reference for composition, timing, camera angle, framing, lighting, background, character continuity, product placement, visible speech lines, and visual actions";
  if (role === "storyboard_canonical") return "first storyboard reference as canonical outfit, exact clothing colors and fabric; use it for continuity only, not for speech or current actions";
  if (role === "product") return "product reference to preserve product appearance";
  if (role === "product_secondary") return "additional product reference to preserve product appearance";
  if (role === "avatar") return "avatar reference";
  if (role === "avatar_product_composite") return "combined avatar and product reference";
  return `${role} reference`;
}
