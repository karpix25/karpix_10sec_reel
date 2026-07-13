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
