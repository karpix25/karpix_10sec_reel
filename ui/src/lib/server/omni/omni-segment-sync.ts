import pool from "@/lib/db";
import type { OmniReel, OmniReelSegment } from "@/lib/omni/types";
import { retrieveProviderVideoTask } from "./omni-provider-tasks";
import { storeCompletedSegment } from "./omni-segment-completion";
import {
  buildOmniSegmentRetryPayload,
  canRetryOmniSegment,
} from "./omni-segment-retry";

export async function syncOmniReelSegments(input: {
  reel: OmniReel;
  segments: OmniReelSegment[];
}) {
  let retried = false;
  for (const segment of input.segments) {
    if (!segment.kie_task_id || segment.status === "completed") continue;

    try {
      const task = await retrieveProviderVideoTask(segment.generation_provider, segment.kie_task_id);
      const status = task.status.toLowerCase();
      if (status === "completed") {
        await storeCompletedSegment({
          projectId: input.reel.project_id,
          segment,
          task,
        });
      } else if (status === "failed" || status === "error") {
        const message = String(task.error || "Omni segment failed");
        if (canRetryOmniSegment(segment.request_payload)) {
          await resetSegmentForRetry(segment, task.raw, message);
          retried = true;
        } else {
          await markSegmentFailed(segment, task.raw, message);
        }
      } else {
        await pool.query(
          `UPDATE omni_reel_segments
           SET status = 'processing',
               response_payload = $2::jsonb,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [segment.id, JSON.stringify(task.raw)]
        );
      }
    } catch (error) {
      await pool.query(
        "UPDATE omni_reel_segments SET error_message = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
        [segment.id, error instanceof Error ? error.message : "Omni segment sync failed"]
      );
    }
  }
  return { retried };
}

async function resetSegmentForRetry(segment: OmniReelSegment, response: unknown, message: string) {
  await pool.query(
    `UPDATE omni_reel_segments
     SET status = 'draft',
         kie_task_id = NULL,
         response_payload = $2::jsonb,
         request_payload = $3::jsonb,
         error_message = $4,
         submitted_at = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [
      segment.id,
      JSON.stringify(response),
      JSON.stringify(buildOmniSegmentRetryPayload(segment.request_payload, message)),
      message,
    ]
  );
}

async function markSegmentFailed(segment: OmniReelSegment, response: unknown, message: string) {
  await pool.query(
    `UPDATE omni_reel_segments
     SET status = 'failed',
         response_payload = $2::jsonb,
         error_message = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [segment.id, JSON.stringify(response), message]
  );
}
