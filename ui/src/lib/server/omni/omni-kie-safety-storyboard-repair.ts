import pool from "@/lib/db";
import type { OmniReel, OmniReelSegment } from "@/lib/omni/types";
import { normalizeOmniGenerationProvider } from "@/lib/omni/provider";
import { normalizeStoryboardSource } from "./physical-scene-validator";
import { hasProductVisibleStoryboardFrame } from "./omni-intro-product-contract";
import { resolveProductReferenceImageUrls } from "./omni-product-reference-images";
import { generateStoryboardImage } from "./omni-storyboard-image-generator";
import { isAvatarFreeReferenceScene, resolveReferenceSceneMode } from "./omni-reference-scene-mode";

const PUBLIC_FIGURE_BLOCK_PATTERN = /prominent public figure|public figure|celebrity|politician|safety review|blocked by (?:google|provider).*safety|generation was blocked.*safety/iu;

export function isKiePublicFigureSafetyBlock(error: unknown) {
  return PUBLIC_FIGURE_BLOCK_PATTERN.test(String(error || ""));
}

export async function regenerateKieSafetyBlockedStoryboard(input: {
  reel: OmniReel;
  segment: OmniReelSegment;
}) {
  const productName = readSnapshotText(input.reel.product_snapshot, "name", "product_name") || "product";
  const storyboard = normalizeStoryboardSource({
    source: input.segment.storyboard_plan,
    segmentIndex: input.segment.segment_index,
    durationSeconds: input.segment.duration_seconds,
    voiceoverText: input.segment.voiceover_text || "",
    productName,
  });
  const referenceSceneMode = resolveReferenceSceneMode(input.reel.creative_strategy);
  const avatarReferenceUrl = isAvatarFreeReferenceScene(referenceSceneMode)
    ? null
    : readSnapshotText(input.reel.avatar_snapshot, "reference_url");
  if (!storyboard || (!isAvatarFreeReferenceScene(referenceSceneMode) && !avatarReferenceUrl)) {
    throw new Error("Cannot safely redraw the blocked storyboard without its saved storyboard plan and avatar reference");
  }

  const storyboardReferenceUrl = await generateStoryboardImage({
    projectId: input.reel.project_id,
    productId: input.reel.product_id,
    reelId: input.reel.id,
    segmentIndex: input.segment.segment_index,
    storyboard,
    productName,
    productPhysicalContract: input.segment.creative_plan?.productRole === "digital_demo"
      ? null
      : readSnapshotText(input.reel.product_snapshot, "product_physical_contract"),
    productRole: input.segment.creative_plan?.productRole,
    avatarReferenceUrl,
    productReferenceUrls: hasProductVisibleStoryboardFrame(storyboard, productName)
      ? resolveProductReferenceImageUrls(input.reel.product_snapshot)
      : [],
    canonicalStoryboardReferenceUrl: await getCanonicalStoryboardReferenceUrl(input.reel.id, input.segment.segment_index),
    directorReferenceImageUrls: [],
    directorBrief: null,
    referenceSceneMode,
    generationProvider: normalizeOmniGenerationProvider(input.segment.generation_provider),
    referenceSafetyInstructions: [
      "Use only the supplied avatar as the person. Do not portray, resemble, or imitate a public figure, celebrity, politician, or other known person.",
    ],
  });
  if (!storyboardReferenceUrl) {
    throw new Error("Safety storyboard redraw returned no image");
  }

  await pool.query(
    `UPDATE omni_reel_segments
     SET storyboard_reference_url = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [input.segment.id, storyboardReferenceUrl]
  );
  return storyboardReferenceUrl;
}

async function getCanonicalStoryboardReferenceUrl(reelId: number, segmentIndex: number) {
  if (segmentIndex === 1) return null;
  const { rows } = await pool.query<{ storyboard_reference_url: string | null }>(
    `SELECT storyboard_reference_url
     FROM omni_reel_segments
     WHERE reel_id = $1
       AND segment_index = 1
     LIMIT 1`,
    [reelId]
  );
  const url = rows[0]?.storyboard_reference_url;
  return typeof url === "string" && url.trim() ? url.trim() : null;
}

function readSnapshotText(snapshot: Record<string, unknown> | null, ...keys: string[]) {
  for (const key of keys) {
    const value = snapshot?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}
