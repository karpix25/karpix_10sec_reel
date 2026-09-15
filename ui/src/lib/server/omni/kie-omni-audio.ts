export type KieOmniVoiceGender = "female" | "male" | "unknown";

export function resolveKieOmniAudioIds(source?: unknown) {
  return extractAudioIds(source) || [];
}

export function detectKieOmniVoiceGender(source?: unknown): KieOmniVoiceGender {
  const explicit = findExplicitGender(source);
  if (explicit !== "unknown") return explicit;

  const textGender = detectGenderFromTexts(collectGenderHintTexts(source));
  return textGender;
}

function extractAudioIds(value: unknown): string[] | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const direct = uniqueIds([
    ...toArray(record.audio_ids),
    ...toArray(record.audioIds),
    record.audio_id,
    record.audioId,
    record.kie_audio_id,
    record.kieAudioId,
  ]);
  if (direct.length) return direct;

  const nested = uniqueIds([
    ...toArray((record.data as Record<string, unknown> | undefined)?.audio_ids),
    ...toArray((record.data as Record<string, unknown> | undefined)?.audioIds),
    (record.data as Record<string, unknown> | undefined)?.audio_id,
    (record.data as Record<string, unknown> | undefined)?.audioId,
    (record.data as Record<string, unknown> | undefined)?.kie_audio_id,
    (record.data as Record<string, unknown> | undefined)?.kieAudioId,
  ]);
  if (nested.length) return nested;

  for (const deeper of [
    record.kie_character_payload,
    record.kieCharacterPayload,
    record.avatar,
    record.latestAvatar,
  ]) {
    const audioIds = extractAudioIds(deeper);
    if (audioIds) return audioIds;
  }

  return null;
}

function findExplicitGender(value: unknown): KieOmniVoiceGender {
  if (!value || typeof value !== "object") return "unknown";
  const record = value as Record<string, unknown>;
  const direct = normalizeGenderValue(
    record.gender ||
      record.sex ||
      record.speech_gender ||
      record.speechGender ||
      record.voice_gender ||
      record.voiceGender ||
      record.avatar_gender ||
      record.avatarGender
  );
  if (direct !== "unknown") return direct;

  for (const nested of [record.data, record.avatar, record.latestAvatar]) {
    const gender = findExplicitGender(nested);
    if (gender !== "unknown") return gender;
  }
  return "unknown";
}

function normalizeGenderValue(value: unknown): KieOmniVoiceGender {
  if (typeof value !== "string") return "unknown";
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "unknown";
  if (["female", "woman", "girl", "f", "ж", "жен", "женский"].includes(normalized)) return "female";
  if (["male", "man", "boy", "m", "м", "муж", "мужской"].includes(normalized)) return "male";
  return detectGenderFromTexts([normalized]);
}

function collectGenderHintTexts(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const textKeys = [
    "prompt",
    "description",
    "display_name",
    "displayName",
    "characterName",
    "character_name",
    "name",
  ];
  return [
    ...textKeys
      .map((key) => record[key])
      .filter((item): item is string => typeof item === "string" && Boolean(item.trim())),
    ...collectGenderHintTexts(record.data),
    ...collectGenderHintTexts(record.avatar),
    ...collectGenderHintTexts(record.latestAvatar),
  ];
}

function detectGenderFromTexts(texts: string[]): KieOmniVoiceGender {
  for (const text of texts) {
    const normalized = text.toLowerCase();
    const female = hasFemaleCue(normalized);
    const male = hasMaleCue(normalized);
    if (female && !male) return "female";
    if (male && !female) return "male";
  }
  return "unknown";
}

function hasFemaleCue(value: string) {
  return (
    /\b(female|woman|girl)\b/i.test(value) ||
    /женщ|женск|девуш|ведущая|героиня|блогерша|(?:^|[^\p{L}])она(?:$|[^\p{L}])/iu.test(value)
  );
}

function hasMaleCue(value: string) {
  return (
    /\b(male|man|boy)\b/i.test(value) ||
    /мужчин|мужск|парень|парня|ведущий|герой|(?:^|[^\p{L}])он(?:$|[^\p{L}])/iu.test(value)
  );
}

function toArray(value: unknown) {
  return Array.isArray(value) ? value : [value];
}

function uniqueIds(values: unknown[]) {
  const seen = new Set<string>();
  return values
    .map((value) => typeof value === "string" ? value.trim() : "")
    .filter(Boolean)
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}
