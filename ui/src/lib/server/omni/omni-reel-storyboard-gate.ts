import pool from "@/lib/db";
import type { OmniReel, OmniReelSegment } from "@/lib/omni/types";
import type { OmniStoryboardSegment } from "@/lib/omni/storyboard/omni-storyboard-types";
import { normalizeOmniGenerationProvider } from "@/lib/omni/provider";
import { extractDirectorBriefFromSnapshot } from "./director-analysis-types";
import { extractDirectorReferenceImageUrls } from "./director-reference-images";
import { hasProductVisibleStoryboardFrame } from "./omni-intro-product-contract";
import { resolveProductIdentityReferenceImageUrls } from "./omni-product-reference-images";
import { generateStoryboardImage } from "./omni-storyboard-image-generator";

export async function ensureOmniReelStoryboardsForSubmission(input: {
  reel: OmniReel;
  segments: OmniReelSegment[];
}) {
  const missing = input.segments
    .filter((segment) => !segment.storyboard_reference_url)
    .sort((left, right) => left.segment_index - right.segment_index);
  if (!missing.length) return input.segments;

  const productName = getSnapshotText(input.reel.product_snapshot, "name") ||
    getSnapshotText(input.reel.product_snapshot, "product_name");
  const productReferences = resolveProductIdentityReferenceImageUrls(input.reel.product_snapshot || {});
  const avatarReferenceUrl = getSnapshotText(input.reel.avatar_snapshot, "reference_url");
  if (!avatarReferenceUrl) throw new Error("Раскадровка требует утвержденный reference avatar");

  const sourceSnapshot = input.reel.source_snapshot;
  const directorBrief = extractDirectorBriefFromSnapshot(sourceSnapshot);
  const directorReferenceImageUrls = extractDirectorReferenceImageUrls({ sourceSnapshot });
  let previousStoryboardReferenceUrl = findPreviousStoryboard(input.segments, missing[0].segment_index);

  for (const segment of missing) {
    if (!segment.storyboard_plan) {
      throw new Error(`Платная раскадровка не создана для сегментов: ${segment.segment_index}`);
    }
    const storyboard = segment.storyboard_plan as OmniStoryboardSegment;
    const storyboardReferenceUrl = await generateStoryboardImage({
      projectId: input.reel.project_id,
      reelId: input.reel.id,
      segmentIndex: segment.segment_index,
      storyboard,
      productName,
      productPhysicalContract: getSnapshotText(input.reel.product_snapshot, "product_physical_contract"),
      avatarReferenceUrl,
      productReferenceUrls: hasProductVisibleStoryboardFrame(storyboard, productName)
        ? productReferences
        : [],
      directorReferenceImageUrls,
      previousStoryboardReferenceUrl,
      directorBrief,
      generationProvider: normalizeOmniGenerationProvider(segment.generation_provider),
    });
    if (!storyboardReferenceUrl) {
      throw new Error(`Платная раскадровка не создана для сегментов: ${segment.segment_index}`);
    }

    await pool.query(
      `UPDATE omni_reel_segments
       SET storyboard_reference_url = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
         AND storyboard_reference_url IS NULL`,
      [segment.id, storyboardReferenceUrl]
    );
    segment.storyboard_reference_url = storyboardReferenceUrl;
    previousStoryboardReferenceUrl = storyboardReferenceUrl;
  }

  return input.segments;
}

function findPreviousStoryboard(segments: readonly OmniReelSegment[], segmentIndex: number) {
  return [...segments]
    .filter((segment) => segment.segment_index < segmentIndex && segment.storyboard_reference_url)
    .sort((left, right) => right.segment_index - left.segment_index)[0]?.storyboard_reference_url || null;
}

function getSnapshotText(snapshot: Record<string, unknown> | null | undefined, key: string) {
  const value = snapshot?.[key];
  return typeof value === "string" ? value.trim() : "";
}
