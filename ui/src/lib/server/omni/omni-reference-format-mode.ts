export type ReferenceFormatMode = "continuous_story" | "voiceover_montage";

const VALID_MODES: readonly ReferenceFormatMode[] = ["continuous_story", "voiceover_montage"];

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
  if (hasMixedDeliveryModes(candidate?.camera_timeline)) return "voiceover_montage";
  const explicit = normalizeReferenceFormatMode(
    candidate?.reference_format_mode ?? candidate?.referenceFormatMode
  );
  if (explicit) return explicit;
  if (!candidate) return "continuous_story";

  const montage = isRecord(candidate.montage_rhythm) ? candidate.montage_rhythm : null;
  const locationTimeline = Array.isArray(candidate.location_timeline) ? candidate.location_timeline : [];
  const cameraTimeline = Array.isArray(candidate.camera_timeline) ? candidate.camera_timeline : [];
  const hasIndependentCutSignals = locationTimeline.length >= 2 && cameraTimeline.length >= 3;
  const hasMontageSignals = hasIndependentCutSignals ||
    (Array.isArray(montage?.transition_style) && montage.transition_style.length >= 2);
  return hasMontageSignals ? "voiceover_montage" : "continuous_story";
}

function hasMixedDeliveryModes(value: unknown) {
  if (!Array.isArray(value)) return false;
  const modes = new Set(value
    .map((item) => isRecord(item) ? item.speech_mode ?? item.speechMode ?? item.delivery_mode : null)
    .filter((mode): mode is string => mode === "on_camera" || mode === "voiceover_only"));
  return modes.has("on_camera") && modes.has("voiceover_only");
}

export function isVoiceoverMontageReference(mode: ReferenceFormatMode | null | undefined) {
  return mode === "voiceover_montage";
}

export function renderReferenceFormatContract(mode: ReferenceFormatMode, referenceSceneMode?: string) {
  return mode === "voiceover_montage"
    ? referenceSceneMode === "voiceover_broll"
      ? "REFERENCE FORMAT: voiceover B-roll montage. One narrator carries the meaning across independent cutaways. Follow the director analysis for subject role, action, crop, and wardrobe per source interval; human identity follows the visible-subject policy and is never copied from the source."
      : "REFERENCE FORMAT: voiceover montage. One narrator carries the meaning across independent cutaways. This may be a hybrid edit: follow each reference interval's delivery mode, subject role, wardrobe, location, action, camera setup, and edit treatment exactly as analyzed. Human identity follows the visible-subject policy and is never copied from the source."
    : "REFERENCE FORMAT: continuous story. Preserve the analyzed subject, outfit, scene, lighting, and physical state between segments only when the director analysis marks them as continuous; honor any explicit analyzed change at a visible cut.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
