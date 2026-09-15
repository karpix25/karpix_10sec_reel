import type { ReferenceFormatMode } from "./omni-reference-format-mode";

const CONTINUITY_PROMPT_CONTRACT = [
  "Start this segment directly from the final pose and layout shown in the provided previous-frame reference.",
  "The current storyboard controls the next shot; preserve the same person, lighting, room, camera, and prop positions until its next explicit cut.",
  "Keep product state continuous; the product is a standalone B-roll object on a stable surface, with no person or hands in product shots. Keep narration continuous.",
  "Do not create a sudden camera cut, lighting change, or background reset at the boundary.",
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
  referenceFormatMode: ReferenceFormatMode = "continuous_story",
  characterIdentityLocked = false,
) {
  if (!images.length) return prompt;
  const labels = images.map((image, index) => `Image ${index + 1}: ${describeReferenceRole(image.role)}`);
  const hasPreviousFrame = images.some((image) => image.role === "previous_last_frame");
  const hasProduct = images.some((image) => image.role === "product" || image.role === "product_secondary");
  const hasCanonicalStoryboard = images.some((image) => image.role === "storyboard_canonical");
  const montageReference = referenceFormatMode === "voiceover_montage";
  const identityContract = characterIdentityLocked
    ? "CHARACTER IDENTITY AUTHORITY: the supplied character_ids is the only source of the avatar's face, hair, age, body and identity. Storyboard images may guide composition, pose, wardrobe, lighting and action, but must match that character and must never introduce or replace the person."
    : "CHARACTER IDENTITY AUTHORITY: if a character_ids reference is supplied, it is the source of the featured person's face and identity; storyboard images are visual context and must not introduce a different person.";
  return [
    prompt.trim(),
    "",
    `KIE reference image order: ${labels.join("; ")}.`,
    identityContract,
    hasPreviousFrame
      ? montageReference
        ? "CONTINUITY AUTHORITY: begin from the previous final frame for pose and product placement only; the current storyboard controls the subject and wardrobe for this independent cut."
        : "CONTINUITY AUTHORITY: begin from the previous final frame and preserve its person, outfit, hair, camera, lighting, room, and prop layout until the current storyboard cuts."
      : "",
    hasCanonicalStoryboard && !montageReference
      ? "WARDROBE AUTHORITY: the canonical storyboard controls the outfit across continuous segments."
      : images.some((image) => image.role === "storyboard")
        ? montageReference
          ? "STORYBOARD VISUAL AUTHORITY: use the storyboard for the current independent cut's composition, pose, wardrobe, lighting and product placement. Its face must match the supplied character_ids; do not create a new person."
        : "STORYBOARD VISUAL AUTHORITY: use the current storyboard for outfit, composition, pose, lighting and action. Its face and identity must match the supplied character_ids; it must not override the character reference."
      : "",
    hasProduct
      ? "Use the product image as the exact standalone source of truth for product appearance: package shape, label layout, cap or lid color, palette, size, material, and printed details. It must not define the character outfit, room, camera, or unrelated props. Show it only where the storyboard calls for it, as a standalone B-roll object on a table, counter, shelf, or other stable surface. Never show a person, hands, holding, pickup, touching, or interaction in the product shot."
      : "",
  ].filter(Boolean).join(" ");
}

function describeReferenceRole(role: string) {
  if (role === "previous_last_frame") return "previous segment final frame for pose, room layout, camera, lighting, and prop positions";
  if (role === "storyboard") return "text-free storyboard reference for composition, timing, camera angle, framing, lighting, background, avatar-matching pose, product placement, and visual actions; never a separate identity source";
  if (role === "storyboard_canonical") return "first storyboard reference as canonical outfit, exact clothing colors and fabric; use it for continuity only, not for speech, current actions, or a separate identity";
  if (role === "product") return "product reference to preserve product appearance";
  if (role === "product_secondary") return "additional product reference to preserve product appearance";
  if (role === "avatar") return "avatar reference";
  if (role === "avatar_product_composite") return "combined avatar and product reference";
  return `${role} reference`;
}
