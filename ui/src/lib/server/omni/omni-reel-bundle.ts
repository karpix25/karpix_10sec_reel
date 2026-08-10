import pool from "@/lib/db";
import type { OmniReel, OmniReelSegment } from "@/lib/omni/types";
import { ensureOmniSchema } from "./schema";

export type OmniReelBundle = {
  reel: OmniReel;
  segments: OmniReelSegment[];
};

export async function getOmniReelBundle(reelId: number): Promise<OmniReelBundle> {
  await ensureOmniSchema();
  const reelResult = await pool.query<OmniReel>("SELECT * FROM omni_reels WHERE id = $1 LIMIT 1", [reelId]);
  const reel = reelResult.rows[0];
  if (!reel) throw new Error("Omni reel not found");

  const segmentResult = await pool.query<OmniReelSegment>(
    `SELECT *
     FROM omni_reel_segments
     WHERE reel_id = $1
     ORDER BY segment_index ASC`,
    [reelId]
  );

  return { reel, segments: segmentResult.rows };
}
