import pool from "@/lib/db";
import type { OmniReel, OmniReelSegment } from "@/lib/omni/types";

export function getOmniSegmentsForSubmission(reel: OmniReel, segments: OmniReelSegment[]) {
  if (reel.pilot_status !== "pending") return segments;
  const pilotIndex = reel.pilot_segment_index || 1;
  return segments.filter((segment) => segment.segment_index === pilotIndex);
}

export async function approveOmniPilotIfReady(reel: OmniReel, segments: OmniReelSegment[]) {
  if (reel.pilot_status !== "pending") return false;
  const pilotIndex = reel.pilot_segment_index || 1;
  const pilot = segments.find((segment) => segment.segment_index === pilotIndex);
  if (!pilot || pilot.status !== "completed") return false;

  await pool.query(
    `UPDATE omni_reels
     SET pilot_status = 'approved',
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND pilot_status = 'pending'`,
    [reel.id]
  );
  return true;
}
