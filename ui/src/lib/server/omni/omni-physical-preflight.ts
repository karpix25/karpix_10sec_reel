import pool from "@/lib/db";
import type { OmniReelSegment } from "@/lib/omni/types";
import type { OmniGenerationProvider } from "@/lib/omni/provider";
import {
  normalizeStoryboardSource,
  validatePhysicalScene,
} from "./physical-scene-validator";

export async function assertOmniPhysicalPreflight(input: {
  reelId: number;
  provider: OmniGenerationProvider;
  productName: string;
  segments: readonly OmniReelSegment[];
}) {
  const pendingSegments = input.segments.filter((segment) =>
    !segment.kie_task_id &&
    !["queued", "submitted", "processing"].includes(String(segment.status)) &&
    segment.status !== "completed"
  );
  const failures = pendingSegments.map((segment) => {
    const storyboard = normalizeStoryboardSource({
      source: segment.storyboard_plan || null,
      segmentIndex: segment.segment_index,
      durationSeconds: segment.duration_seconds || 10,
      voiceoverText: segment.voiceover_text || segment.creative_plan?.voiceoverText || "",
      productName: input.productName,
    });
    return {
      segment,
      validation: validatePhysicalScene({
        storyboard,
        creativePlan: segment.creative_plan,
        productName: input.productName,
      }),
    };
  }).filter((item) => !item.validation.valid);

  if (!failures.length) return;
  const message = `Physical scene preflight blocked: ${failures
    .map((item) => `segment ${item.segment.segment_index}: ${item.validation.errors.join(", ")}`)
    .join("; ")}`;
  for (const failure of failures) {
    await pool.query(
      `UPDATE omni_reel_segments
       SET prompt_validation = $2::jsonb,
           error_message = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [failure.segment.id, JSON.stringify(failure.validation), message]
    );
  }
  await pool.query(
    `UPDATE omni_reels
     SET status = 'failed', error_message = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [input.reelId, message]
  );
  await pool.query(
    `UPDATE omni_reel_segments
     SET status = 'failed', generation_provider = $2, error_message = $3, updated_at = CURRENT_TIMESTAMP
     WHERE reel_id = $1 AND status = 'draft'`,
    [input.reelId, input.provider, message]
  );
  throw new Error(message);
}
