export const OMNI_MOBILE_UGC_STYLE = [
  "Natural vertical smartphone UGC video.",
  "Shot on a phone at home with subtle handheld movement.",
  "Realistic home lighting, casual kitchen or room atmosphere.",
  "The same woman appears throughout the entire reel.",
  "She keeps the same face, age, hairstyle, outfit, mood, and speaking style in every segment.",
  "The background stays consistent, as if filmed in one continuous home session.",
  "She speaks naturally to the camera, like sharing a personal routine with a friend.",
  "The product is shown through simple real actions: taking it, pouring it into a glass, stirring, tasting.",
  "The mood is calm, honest, everyday, and personal.",
].join("\n");

export function buildSegmentContinuityLine(segmentIndex: number, segmentCount: number) {
  return `This is part ${segmentIndex}/${segmentCount} of one continuous UGC video. Keep the same person, same outfit, same room, same lighting, same phone-camera style, and continue the same lived-in scene.`;
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
