export const OMNI_MOBILE_UGC_STYLE = [
  "Natural vertical smartphone UGC video.",
  "Shot on a phone at home with subtle handheld movement.",
  "Realistic home lighting, casual kitchen or room atmosphere.",
  "A fictional UGC presenter with a similar general age, hair color, and everyday style appears throughout the reel.",
  "Use the avatar reference as a loose character moodboard for a privacy-safe fictional presenter.",
  "Keep the presenter's general type, outfit color palette, mood, and speaking style consistent in every segment.",
  "The background stays consistent, as if filmed in one continuous home session.",
  "She speaks naturally to the camera, like sharing a personal routine with a friend.",
  "The product is shown through simple real actions: taking it, pouring it into a glass, stirring, tasting.",
  "The mood is calm, honest, everyday, and personal.",
].join("\n");

export function buildSegmentContinuityLine(segmentIndex: number, segmentCount: number) {
  return `This is part ${segmentIndex}/${segmentCount} of one continuous UGC video. Keep a similar fictional presenter type, the same outfit palette, same room, same lighting, same phone-camera style, and continue the same lived-in scene.`;
}

export function buildSegmentStoryGoal(segmentIndex: number, segmentCount: number) {
  if (segmentIndex === 1) {
    return "Open with a natural everyday hook: the person starts a simple home routine and gives the viewer a reason to keep watching.";
  }
  if (segmentIndex === segmentCount) {
    return "Close with a calm personal takeaway and a soft CTA that feels like a friendly recommendation.";
  }
  return "Show the product in use through one simple realistic action that continues the same home routine.";
}
