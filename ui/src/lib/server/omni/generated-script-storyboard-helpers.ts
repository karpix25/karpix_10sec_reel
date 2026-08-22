import type { OmniGenerationProvider } from "@/lib/omni/provider";
import type { ProductRole } from "@/lib/omni/creative-contract";
import type { ReferenceSceneMode } from "./omni-reference-scene-mode";
import type { ReferenceFormatMode } from "./omni-reference-format-mode";

export const STORYBOARD_PREVIEW_GENERATOR_VERSION = "storyboard-image-physical-product-v20";

export function buildGeneratedScriptStoryboardReferenceSignature(input: {
  avatarReferenceUrl: string | null;
  productPhysicalContract?: string | null;
  productReferenceUrls: readonly string[];
  generationProvider?: OmniGenerationProvider;
  referenceSceneMode?: ReferenceSceneMode;
  referenceFormatMode?: ReferenceFormatMode;
  promptPlan: readonly { index: number; storyboardPlan: unknown; productRole?: ProductRole }[];
}, planSignature: string) {
  return [
    STORYBOARD_PREVIEW_GENERATOR_VERSION,
    planSignature,
    input.generationProvider || "cometapi",
    input.referenceSceneMode || "presenter",
    input.referenceFormatMode || "continuous_story",
    normalizeUrl(input.avatarReferenceUrl) || "",
    normalizeContract(input.productPhysicalContract),
    ...input.productReferenceUrls.map((url) => normalizeUrl(url) || "").filter(Boolean).sort(),
  ].join("|");
}

export function getSegmentDirectorReferenceUrls(input: {
  directorReferenceImageUrls?: readonly string[];
  directorReferenceImageUrlsBySegment?: ReadonlyMap<number, readonly string[]>;
}, segmentIndex: number) {
  return Array.from(
    input.directorReferenceImageUrlsBySegment?.get(segmentIndex) || input.directorReferenceImageUrls || []
  );
}

export function rowsToUrlMap(rows: readonly { segment_index: number; storyboard_reference_url: string | null }[]) {
  return new Map(
    rows
      .map((row) => [Number(row.segment_index), normalizeUrl(row.storyboard_reference_url)] as const)
      .filter((entry): entry is readonly [number, string] => Number.isInteger(entry[0]) && Boolean(entry[1]))
  );
}

export function normalizeUrl(value: string | null) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeContract(value: string | null | undefined) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}
