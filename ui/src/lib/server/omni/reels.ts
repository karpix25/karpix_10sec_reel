import pool from "@/lib/db";
import { OmniReel, OmniReelSegment } from "@/lib/omni/types";
import { ensureOmniSchema } from "./schema";

const SEGMENT_SECONDS = 10;

function resolveTargetDuration(value: unknown) {
  const parsed = Number.parseInt(String(value || "30"), 10);
  return [30, 40].includes(parsed) ? parsed : 30;
}

function segmentCountForDuration(durationSeconds: number) {
  return Math.ceil(durationSeconds / SEGMENT_SECONDS);
}

export async function listOmniReels(projectId: number, productId?: number | null) {
  await ensureOmniSchema();
  const values: unknown[] = [projectId];
  const clauses = ["project_id = $1"];
  if (productId) {
    values.push(productId);
    clauses.push(`product_id = $${values.length}`);
  }

  const { rows } = await pool.query<OmniReel>(
    `SELECT *
     FROM omni_reels
     WHERE ${clauses.join(" AND ")}
     ORDER BY created_at DESC, id DESC
     LIMIT 50`,
    values
  );
  return rows;
}

export async function listOmniReelSegments(reelIds: number[]) {
  await ensureOmniSchema();
  if (!reelIds.length) return [];
  const { rows } = await pool.query<OmniReelSegment>(
    `SELECT *
     FROM omni_reel_segments
     WHERE reel_id = ANY($1::int[])
     ORDER BY reel_id DESC, segment_index ASC`,
    [reelIds]
  );
  return rows;
}

export async function createOmniReel(input: {
  projectId: number;
  productId: number;
  sourceLegacyScenarioId?: number | null;
  targetDurationSeconds?: unknown;
  brief?: unknown;
}) {
  await ensureOmniSchema();
  const targetDuration = resolveTargetDuration(input.targetDurationSeconds);
  const segmentCount = segmentCountForDuration(targetDuration);
  const brief = typeof input.brief === "string" && input.brief.trim() ? input.brief.trim() : null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reelResult = await client.query<OmniReel>(
      `INSERT INTO omni_reels (
         project_id,
         product_id,
         source_legacy_scenario_id,
         target_duration_seconds,
         segment_count,
         status,
         brief,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, 'draft', $6, CURRENT_TIMESTAMP)
       RETURNING *`,
      [input.projectId, input.productId, input.sourceLegacyScenarioId || null, targetDuration, segmentCount, brief]
    );
    const reel = reelResult.rows[0];

    for (let index = 0; index < segmentCount; index += 1) {
      await client.query(
        `INSERT INTO omni_reel_segments (
           reel_id,
           segment_index,
           duration_seconds,
           status,
           prompt
         )
         VALUES ($1, $2, $3, 'draft', $4)`,
        [reel.id, index + 1, SEGMENT_SECONDS, buildDraftPrompt(index + 1, segmentCount, brief)]
      );
    }

    await client.query("COMMIT");
    return reel;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function buildDraftPrompt(index: number, total: number, brief: string | null) {
  const base = `Omni reel segment ${index}/${total}. Duration exactly 10 seconds. Vertical 9:16.`;
  return brief ? `${base}\nBrief: ${brief}` : base;
}
