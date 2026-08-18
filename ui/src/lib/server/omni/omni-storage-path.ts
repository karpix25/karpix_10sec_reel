export const OMNI_STORAGE_PREFIX = "omni";

export function buildOmniStorageKey(key: string) {
  return `${OMNI_STORAGE_PREFIX}/${key.replace(/^\/+/, "")}`;
}
