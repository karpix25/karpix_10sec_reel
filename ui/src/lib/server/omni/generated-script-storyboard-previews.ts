import pool from "@/lib/db";
import { ensureOmniSchema } from "./schema";

export async function getLatestGeneratedScriptStoryboardUrls(input: {
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
       ORDER BY created_at DESC, id DESC
       LIMIT 1
     )
     SELECT segment_index, storyboard_reference_url
     FROM omni_reel_segments
     WHERE reel_id = (SELECT id FROM latest_reel)
     ORDER BY segment_index ASC`,
    [input.projectId, input.productId, input.scriptId]
  );

  return new Map(
    rows
      .map((row) => [Number(row.segment_index), normalizeUrl(row.storyboard_reference_url)] as const)
      .filter((entry): entry is readonly [number, string] => Number.isInteger(entry[0]) && Boolean(entry[1]))
  );
}

function normalizeUrl(value: string | null) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
