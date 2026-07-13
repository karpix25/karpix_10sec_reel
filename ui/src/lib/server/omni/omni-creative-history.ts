import pool from "@/lib/db";
import type { LifeFormatId } from "@/lib/omni/creative-contract";
import { OMNI_LIFE_FORMATS } from "./omni-life-formats";

export async function listRecentLifeFormatIds(projectId: number, productId: number): Promise<LifeFormatId[]> {
  const { rows } = await pool.query<{ format_id: string | null }>(
    `SELECT creative_strategy->>'lifeFormatId' AS format_id
     FROM omni_reels
     WHERE project_id = $1
       AND product_id = $2
       AND creative_strategy IS NOT NULL
     ORDER BY created_at DESC
     LIMIT 5`,
    [projectId, productId]
  );
  const allowed = new Set(OMNI_LIFE_FORMATS.map((format) => format.id));
  return rows
    .map((row) => row.format_id)
    .filter((id): id is LifeFormatId => Boolean(id && allowed.has(id as LifeFormatId)));
}
