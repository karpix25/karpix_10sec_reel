export const OMNI_AVATAR_SPEECH_GENDERS = ["female", "male"] as const;

export type OmniAvatarSpeechGender = (typeof OMNI_AVATAR_SPEECH_GENDERS)[number];

export function normalizeAvatarSpeechGender(value: unknown): OmniAvatarSpeechGender | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized === "female" || normalized === "male" ? normalized : null;
}

export function requireAvatarSpeechGender(value: unknown): OmniAvatarSpeechGender {
  const gender = normalizeAvatarSpeechGender(value);
  if (!gender) throw new Error("Avatar speech gender must be male or female");
  return gender;
}

export function getAvatarSpeechGenderLabel(gender: OmniAvatarSpeechGender | null | undefined) {
  if (!gender) return "Не выбран";
  return gender === "male" ? "Мужчина" : "Женщина";
}
