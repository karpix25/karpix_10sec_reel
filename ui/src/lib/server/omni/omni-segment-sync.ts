import pool from "@/lib/db";
import type { OmniReel, OmniReelSegment } from "@/lib/omni/types";
import { retrieveProviderVideoTask } from "./omni-provider-tasks";
import { storeCompletedSegment } from "./omni-segment-completion";
import {
  buildOmniSegmentRetryPayload,
  canRetryOmniSegment,
  hasKieSafetyStoryboardRepair,
} from "./omni-segment-retry";
import { recordKieGenerationCost } from "./omni-generation-costs";
import { isKieStoryboardImagePendingError } from "./kie-omni-client";
import {
  isKiePublicFigureSafetyBlock,
  regenerateKieSafetyBlockedStoryboard,
} from "./omni-kie-safety-storyboard-repair";

export async function syncOmniReelSegments(input: {
  reel: OmniReel;
  segments: OmniReelSegment[];
}) {
  let retried = false;
  let waitingForStoryboardRepair = false;
  for (const segment of input.segments) {
    if (!segment.kie_task_id || segment.status === "completed") continue;

    try {
      const task = await retrieveProviderVideoTask(segment.generation_provider, segment.kie_task_id);
      const status = task.status.toLowerCase();
      if (segment.generation_provider === "kie-ai") {
        await recordKieGenerationCost({
          projectId: input.reel.project_id,
          productId: input.reel.product_id,
          generatedScriptId: input.reel.source_generated_script_id,
          reelId: input.reel.id,
          reelSegmentId: segment.id,
          operation: "video",
          taskId: task.id,
          status,
          model: "gemini-omni-video",
          raw: task.raw,
        }).catch((error) => console.error("KIE video cost sync failed:", error));
      }
      if (status === "completed") {
        await storeCompletedSegment({
          projectId: input.reel.project_id,
          segment,
          task,
        });
      } else if (status === "failed" || status === "error") {
        const message = String(task.error || "Omni segment failed");
        const safetyStoryboardRepair = segment.generation_provider === "kie-ai" &&
          isKiePublicFigureSafetyBlock(message) &&
          !hasKieSafetyStoryboardRepair(segment.request_payload);
        if (canRetryOmniSegment(segment.request_payload) || safetyStoryboardRepair) {
          if (safetyStoryboardRepair) {
            try {
              await regenerateKieSafetyBlockedStoryboard({
                reel: input.reel,
                segment,
                pendingKieStoryboardTaskId: readPendingSafetyStoryboardTaskId(segment.request_payload),
              });
            } catch (error) {
              if (!isKieStoryboardImagePendingError(error)) throw error;
              await savePendingSafetyStoryboardTask(segment, error.task.id, error.message);
              waitingForStoryboardRepair = true;
              continue;
            }
          }
          await resetSegmentForRetry(segment, task.raw, message, safetyStoryboardRepair);
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
  return { retried, waitingForStoryboardRepair };
}

async function resetSegmentForRetry(
  segment: OmniReelSegment,
  response: unknown,
  message: string,
  safetyStoryboardRepaired = false
) {
  const retryPayload = buildOmniSegmentRetryPayload(segment.request_payload, message, {
    safetyStoryboardRepaired,
  });
  delete (retryPayload as Record<string, unknown>).omni_kie_safety_storyboard_task_id;
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
      JSON.stringify(retryPayload),
      message,
    ]
  );
}

async function savePendingSafetyStoryboardTask(segment: OmniReelSegment, taskId: string, message: string) {
  await pool.query(
    `UPDATE omni_reel_segments
     SET request_payload = $2::jsonb,
         error_message = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [
      segment.id,
      JSON.stringify({
        ...(segment.request_payload || {}),
        omni_kie_safety_storyboard_task_id: taskId,
      }),
      message,
    ]
  );
}

function readPendingSafetyStoryboardTaskId(payload?: Record<string, unknown> | null) {
  const value = payload?.omni_kie_safety_storyboard_task_id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
