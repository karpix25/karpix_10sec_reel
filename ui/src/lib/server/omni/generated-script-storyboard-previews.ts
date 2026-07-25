import pool from "@/lib/db";
import type { OmniStoryboardSegment } from "@/lib/omni/storyboard/omni-storyboard-types";
import { generateStoryboardImage } from "./omni-storyboard-image-generator";
import { ensureOmniSchema } from "./schema";

type StoryboardPromptSegment = {
  index: number;
  storyboardPlan: OmniStoryboardSegment | null;
};

export async function ensureGeneratedScriptStoryboardUrls(input: {
  projectId: number;
  productId: number;
  scriptId: number;
  productName: string;
  avatarReferenceUrl: string | null;
  promptPlan: readonly StoryboardPromptSegment[];
}) {
  await ensureOmniSchema();
  const urls = await getStoredGeneratedScriptStoryboardUrls(input);
  const reelUrls = await getLatestGeneratedScriptReelStoryboardUrls(input);

  for (const segment of input.promptPlan) {
    if (urls.has(segment.index)) continue;
    const reelUrl = reelUrls.get(segment.index);
    if (reelUrl) {
      await upsertGeneratedScriptStoryboardUrl({
        ...input,
        segmentIndex: segment.index,
        storyboardPlan: segment.storyboardPlan,
        url: reelUrl,
      });
      urls.set(segment.index, reelUrl);
      continue;
    }

    if (!segment.storyboardPlan) continue;
    const generatedUrl = await tryGenerateStoryboardPreview({
      ...input,
      segmentIndex: segment.index,
      storyboardPlan: segment.storyboardPlan,
    });
    if (generatedUrl) urls.set(segment.index, generatedUrl);
  }

  return urls;
}

async function getStoredGeneratedScriptStoryboardUrls(input: {
  projectId: number;
  productId: number;
  scriptId: number;
}) {
  const { rows } = await pool.query<{
    segment_index: number;
    storyboard_reference_url: string | null;
  }>(
    `SELECT segment_index, storyboard_reference_url
     FROM omni_generated_script_storyboards
     WHERE project_id = $1
       AND product_id = $2
       AND generated_script_id = $3
     ORDER BY segment_index ASC`,
    [input.projectId, input.productId, input.scriptId]
  );

  return rowsToUrlMap(rows);
}

async function getLatestGeneratedScriptReelStoryboardUrls(input: {
  projectId: number;
  productId: number;
  scriptId: number;
}) {
  await ensureOmniSchema();

  const { rows } = await pool.query<{
    segment_index: number;
    storyboard_reference_url: string | null;
  }>(
    `WITH latest_reel AS (
       SELECT id
       FROM omni_reels
       WHERE project_id = $1
         AND product_id = $2
         AND source_generated_script_id = $3
         AND EXISTS (
           SELECT 1
           FROM omni_reel_segments
           WHERE reel_id = omni_reels.id
             AND storyboard_reference_url IS NOT NULL
             AND storyboard_reference_url <> ''
         )
       ORDER BY created_at DESC, id DESC
       LIMIT 1
     )
     SELECT segment_index, storyboard_reference_url
     FROM omni_reel_segments
     WHERE reel_id = (SELECT id FROM latest_reel)
     ORDER BY segment_index ASC`,
    [input.projectId, input.productId, input.scriptId]
  );

  return rowsToUrlMap(rows);
}

async function tryGenerateStoryboardPreview(input: {
  projectId: number;
  productId: number;
  scriptId: number;
  productName: string;
  avatarReferenceUrl: string | null;
  segmentIndex: number;
  storyboardPlan: OmniStoryboardSegment;
}) {
  try {
    const url = await generateStoryboardImage({
      projectId: input.projectId,
      scriptId: input.scriptId,
      segmentIndex: input.segmentIndex,
      storyboard: input.storyboardPlan,
      productName: input.productName,
      avatarReferenceUrl: input.avatarReferenceUrl,
    });
    if (!url) return null;
    await upsertGeneratedScriptStoryboardUrl({ ...input, url });
    return url;
  } catch (error) {
    console.warn("Generated script storyboard preview image failed:", {
      scriptId: input.scriptId,
      segmentIndex: input.segmentIndex,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function upsertGeneratedScriptStoryboardUrl(input: {
  projectId: number;
  productId: number;
  scriptId: number;
  segmentIndex: number;
  storyboardPlan: OmniStoryboardSegment | null;
  url: string;
}) {
  await pool.query(
    `INSERT INTO omni_generated_script_storyboards (
       project_id,
       product_id,
       generated_script_id,
       segment_index,
       storyboard_plan,
       storyboard_reference_url,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, CURRENT_TIMESTAMP)
     ON CONFLICT (generated_script_id, segment_index)
     DO UPDATE SET
       storyboard_plan = EXCLUDED.storyboard_plan,
       storyboard_reference_url = EXCLUDED.storyboard_reference_url,
       updated_at = CURRENT_TIMESTAMP`,
    [
      input.projectId,
      input.productId,
      input.scriptId,
      input.segmentIndex,
      input.storyboardPlan ? JSON.stringify(input.storyboardPlan) : null,
      input.url,
    ]
  );
}

function rowsToUrlMap(rows: readonly { segment_index: number; storyboard_reference_url: string | null }[]) {
  return new Map(
    rows
      .map((row) => [Number(row.segment_index), normalizeUrl(row.storyboard_reference_url)] as const)
      .filter((entry): entry is readonly [number, string] => Number.isInteger(entry[0]) && Boolean(entry[1]))
  );
}

function normalizeUrl(value: string | null) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
