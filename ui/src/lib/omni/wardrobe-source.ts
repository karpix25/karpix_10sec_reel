export const OMNI_WARDROBE_SOURCES = ["director_reference", "avatar_reference"] as const;

export type OmniWardrobeSource = (typeof OMNI_WARDROBE_SOURCES)[number];

export const DEFAULT_OMNI_WARDROBE_SOURCE: OmniWardrobeSource = "director_reference";

export function normalizeOmniWardrobeSource(value: unknown): OmniWardrobeSource {
  return value === "avatar_reference" ? "avatar_reference" : DEFAULT_OMNI_WARDROBE_SOURCE;
}

export function getOmniWardrobeSourceLabel(source: OmniWardrobeSource) {
  return source === "avatar_reference" ? "Всегда с аватара" : "Как в референсе";
}
