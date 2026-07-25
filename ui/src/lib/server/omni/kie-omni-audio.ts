const LEGACY_DEFAULT_KIE_OMNI_AUDIO_ID = "4a786461922c4383a2010d9b8a4b4f33";

export function resolveKieOmniAudioIds(source?: unknown) {
  return (
    parseAudioIds(process.env.KIE_OMNI_AUDIO_IDS) ||
    parseAudioIds(process.env.KIE_OMNI_AUDIO_ID) ||
    parseAudioIds(process.env.KIE_AUDIO_IDS) ||
    parseAudioIds(process.env.KIE_AUDIO_ID) ||
    extractAudioIds(source) ||
    [LEGACY_DEFAULT_KIE_OMNI_AUDIO_ID]
  );
}

function parseAudioIds(value: unknown) {
  if (typeof value !== "string") return null;
  const ids = uniqueIds(value.split(","));
  return ids.length ? ids : null;
}

function extractAudioIds(value: unknown): string[] | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const direct = uniqueIds([
    ...toArray(record.audio_ids),
    ...toArray(record.audioIds),
    record.audio_id,
    record.audioId,
  ]);
  if (direct.length) return direct;

  const nested = uniqueIds([
    ...toArray((record.data as Record<string, unknown> | undefined)?.audio_ids),
    ...toArray((record.data as Record<string, unknown> | undefined)?.audioIds),
    (record.data as Record<string, unknown> | undefined)?.audio_id,
    (record.data as Record<string, unknown> | undefined)?.audioId,
  ]);
  return nested.length ? nested : null;
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
