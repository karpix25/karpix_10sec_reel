export type ReferenceFormatMode = "continuous_story" | "voiceover_montage";

const VALID_MODES: readonly ReferenceFormatMode[] = ["continuous_story", "voiceover_montage"];
const OUTFIT_VARIATION_PATTERN = /(?:mix(?:ing|ed)|multiple|various|different|several|range of|outfit changes?|wardrobe changes?|разн(?:ая|ые)\s+(?:одежд|образ)|нескольк(?:о|ие)\s+(?:образ|наряд)|смен[а-яё]*\s+одежд)/iu;
const NARRATION_PATTERN = /(?:voice[- ]?over|narrat(?:ion|ed)|off[- ]camera|закадр(?:овый|овая|ом)?\s+голос|озвучк)/iu;

export function normalizeReferenceFormatMode(value: unknown): ReferenceFormatMode | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/[ -]+/gu, "_");
  if (normalized === "montage" || normalized === "narrated_montage" || normalized === "voice_over_montage") {
    return "voiceover_montage";
  }
  if (normalized === "continuous" || normalized === "single_scene" || normalized === "story") {
    return "continuous_story";
  }
  return VALID_MODES.includes(normalized as ReferenceFormatMode) ? normalized as ReferenceFormatMode : null;
}

export function resolveReferenceFormatMode(brief: unknown): ReferenceFormatMode {
  const candidate = isRecord(brief) ? brief : null;
  const explicit = normalizeReferenceFormatMode(
    candidate?.reference_format_mode ?? candidate?.referenceFormatMode
  );
  if (explicit) return explicit;
  if (!candidate) return "continuous_story";

  const clothing = isRecord(candidate.clothing) ? candidate.clothing : null;
  const montage = isRecord(candidate.montage_rhythm) ? candidate.montage_rhythm : null;
  const locationTimeline = Array.isArray(candidate.location_timeline) ? candidate.location_timeline : [];
  const cameraTimeline = Array.isArray(candidate.camera_timeline) ? candidate.camera_timeline : [];
  const observedText = [
    candidate.reference_action_style,
    clothing?.style,
    clothing?.fit_details,
    clothing?.adaptation_notes,
    ...(Array.isArray(montage?.transition_style) ? montage.transition_style : []),
  ].filter((value): value is string => typeof value === "string").join(" ");
  const hasIndependentCutSignals = locationTimeline.length >= 2 || cameraTimeline.length >= 3;
  const hasMontageSignals = (OUTFIT_VARIATION_PATTERN.test(observedText) && hasIndependentCutSignals) ||
    (NARRATION_PATTERN.test(observedText) && cameraTimeline.length >= 3 && locationTimeline.length >= 2) ||
    (hasIndependentCutSignals && Array.isArray(montage?.transition_style) && montage.transition_style.length >= 2);
  return hasMontageSignals ? "voiceover_montage" : "continuous_story";
}

export function isVoiceoverMontageReference(mode: ReferenceFormatMode | null | undefined) {
  return mode === "voiceover_montage";
}

export function renderReferenceFormatContract(mode: ReferenceFormatMode, referenceSceneMode?: string) {
  return mode === "voiceover_montage"
    ? referenceSceneMode === "voiceover_broll"
      ? "REFERENCE FORMAT: voiceover B-roll montage. One narrator carries the meaning across independent cutaways. Preserve the saved avatar identity as the silent visual protagonist; each cut follows its own matching location, action, camera setup, and outfit from the reference frames."
      : "REFERENCE FORMAT: voiceover montage. One narrator carries the meaning across independent cutaways. Keep the same presenter identity, but allow each independent segment to use its own matching location, action, camera setup, and outfit from the corresponding reference frames. Do not force scene or wardrobe continuity between unrelated cuts."
    : "REFERENCE FORMAT: continuous story. Preserve the same presenter identity, outfit, scene, lighting, and physical state between segments unless a visible reference cut explicitly changes them.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
