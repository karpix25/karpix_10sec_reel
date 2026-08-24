import { normalizeAudioMood, type AudioMood } from "../audio-library/moods";

export const DIRECTOR_AUDIO_MIN_CONFIDENCE = 0.65;

export type DirectorAudioMusicRole =
  | "none"
  | "background_bed"
  | "rhythmic_edit_driver"
  | "emotional_accent"
  | "unknown";

export type DirectorAudioEnergy = "low" | "medium" | "high" | "unknown";
export type DirectorAudioTempo = "slow" | "medium" | "fast" | "unknown";
export type DirectorAudioVoicePriority = "low" | "medium" | "high" | "unknown";

export type DirectorAudioProfile = {
  music_present: boolean;
  music_role: DirectorAudioMusicRole;
  mood: AudioMood;
  energy: DirectorAudioEnergy;
  tempo: DirectorAudioTempo;
  voice_priority: DirectorAudioVoicePriority;
  confidence: number;
  evidence: string;
};

export function normalizeDirectorAudioProfile(value: unknown): DirectorAudioProfile | undefined {
  if (!isRecord(value)) return undefined;

  const musicPresent = value.music_present ?? value.musicPresent;
  if (typeof musicPresent !== "boolean") return undefined;

  return {
    music_present: musicPresent,
    music_role: normalizeEnum(value.music_role ?? value.musicRole, [
      "none",
      "background_bed",
      "rhythmic_edit_driver",
      "emotional_accent",
      "unknown",
    ] as const, musicPresent ? "unknown" : "none"),
    mood: normalizeAudioMood(value.mood ?? value.music_mood ?? value.musicMood),
    energy: normalizeEnum(value.energy, ["low", "medium", "high", "unknown"] as const, "unknown"),
    tempo: normalizeEnum(value.tempo, ["slow", "medium", "fast", "unknown"] as const, "unknown"),
    voice_priority: normalizeEnum(
      value.voice_priority ?? value.voicePriority,
      ["low", "medium", "high", "unknown"] as const,
      "unknown"
    ),
    confidence: normalizeConfidence(value.confidence),
    evidence: typeof value.evidence === "string" ? value.evidence.trim() : "",
  };
}

export function shouldAddReferenceMusic(profile: DirectorAudioProfile | null | undefined) {
  return Boolean(
    profile?.music_present === true &&
      profile.confidence >= DIRECTOR_AUDIO_MIN_CONFIDENCE &&
      profile.music_role !== "none"
  );
}

function normalizeConfidence(value: unknown) {
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) return 0;
  return Math.max(0, Math.min(1, confidence));
}

function normalizeEnum<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === "string" && values.includes(value.trim().toLowerCase() as T)
    ? value.trim().toLowerCase() as T
    : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
