export const OMNI_MOBILE_UGC_STYLE = [
  "Natural vertical smartphone UGC video.",
  "Shot on a phone at home with subtle handheld movement.",
  "Realistic home lighting, casual kitchen or room atmosphere.",
  "A fictional UGC presenter with a similar general age, hair color, and everyday style appears throughout the reel.",
  "Use the avatar reference as a loose character moodboard for a privacy-safe fictional presenter.",
  "Keep the presenter's general type, outfit color palette, mood, and speaking style consistent in every segment.",
  "Use one continuous home session with dynamic phone-shot coverage: selfie, close-up hands, product insert, mirror or countertop angle in the same room.",
  "She speaks naturally to the camera, like sharing a personal routine with a friend, while the camera changes angle inside the same home without background jumps.",
  "The product is shown through simple real actions: taking it, pouring it into a glass, stirring, tasting.",
  "The mood is calm, honest, everyday, and personal.",
].join("\n");

export function buildSegmentContinuityLine(segmentIndex: number, segmentCount: number) {
  return `This is part ${segmentIndex}/${segmentCount} of one continuous UGC video. Keep a similar fictional presenter type, same outfit palette, same home, same lighting family, same phone-camera style, and continue the same lived-in routine with fresh shot angles inside the same room.`;
}

export function buildSegmentStoryGoal(segmentIndex: number, segmentCount: number) {
  if (segmentIndex === 1) {
    return "Open with a visually unusual everyday hook in the first 3 seconds, then reveal the home routine and give the viewer a reason to keep watching.";
  }
  if (segmentIndex === segmentCount) {
    return "Close with the product visible in hand or on the counter, a calm personal takeaway, and a soft CTA that feels like a friendly recommendation.";
  }
  return "Show the product clearly in use through one simple realistic action that continues the same home routine.";
}

export function buildSegmentShotPlan(segmentIndex: number, segmentCount: number) {
  if (segmentIndex === 1) {
    return [
      "0-3s: visual pattern interrupt hook in the same room, such as the presenter holding an empty glass close to the phone lens, a fast tilt down to the countertop, or opening a cabinet with the product just out of focus.",
      "3-7s: smooth move back to casual selfie angle; the presenter starts the line naturally while staying in the same home area.",
      "7-10s: handheld tilt or step-in to hands/countertop, preparing the viewer for the product reveal in the next segment.",
    ].join("\n");
  }

  if (segmentIndex === segmentCount) {
    return [
      "0-3s: close-up product insert in hand or on the same counter, label facing camera.",
      "3-7s: smooth move back to the same presenter reacting naturally after using or preparing the product.",
      "7-10s: end with product still visible and a relaxed phone-camera closing beat.",
    ].join("\n");
  }

  return [
    "0-3s: product appears clearly as the visual anchor on the same counter, label or package visible.",
    "3-7s: hands prepare or use the product: pour, stir, hold, taste, or place it beside a glass.",
    "7-10s: smooth move back to a natural selfie reaction while the product remains in frame.",
  ].join("\n");
}
