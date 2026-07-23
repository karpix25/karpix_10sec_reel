export function renderOmniVerticalRhythmContract(input: {
  talkingHead: boolean;
  segmentIndex: number;
  segmentCount: number;
}) {
  return [
    "RETENTION RHYTHM: modern vertical creator pacing, not a polished commercial. The clip should feel edited for Reels/TikTok attention, while staying physically believable.",
    "DELIVERY: start with the first spoken word on frame 0; no inhale, no greeting pause, no dead air, no slow setup. Speak energetic conversational Russian, fast but intelligible, with natural emphasis on punch words.",
    "PERFORMANCE: active eye contact, expressive eyebrows, small confident gestures, slight lean-ins on key claims, and real micro-reactions. Avoid monotone presenter delivery, frozen shoulders, and theatrical overacting.",
    "CAMERA ENERGY: handheld phone realism with subtle reframing, tiny push-ins, or micro zoom pulses every 1.5-2.5 seconds when plausible. Avoid slow glossy ad movement, dreamy morphing, or perfectly locked studio framing.",
    input.talkingHead
      ? "CUTAWAY RHYTHM: if the plan calls for a product/action insert, make it feel like a hard jump-cut style phone edit: quick tactile close-up, immediate return to the presenter, no dissolve and no magic transformation."
      : "VISUAL RHYTHM: keep the action changing in small readable beats instead of holding one static pose for the whole clip.",
    input.segmentIndex < input.segmentCount
      ? "CUT-READY END: finish still in motion and ready for the next segment; no closing pause, no final nod, no wave, no extra phrase, no reset to neutral."
      : "FINAL ENDING: stop cleanly after the scripted last word; no added farewell, no extra CTA, no lingering silence.",
  ].join(" ");
}
