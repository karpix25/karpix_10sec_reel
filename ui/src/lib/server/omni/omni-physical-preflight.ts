import pool from "@/lib/db";
import type { OmniReelSegment } from "@/lib/omni/types";
import type { OmniGenerationProvider } from "@/lib/omni/provider";
import {
  normalizeStoryboardSource,
  validatePhysicalScene,
} from "./physical-scene-validator";
import {
  applyCanonicalStoryboardOverrides,
  normalizePhysicalStoryboardSegment,
} from "./physical-storyboard-normalizer";

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
  const results = pendingSegments.map((segment) => {
    const sourceStoryboard = normalizeStoryboardSource({
      source: segment.storyboard_plan || null,
      segmentIndex: segment.segment_index,
      durationSeconds: segment.duration_seconds || 10,
      voiceoverText: segment.voiceover_text || segment.creative_plan?.voiceoverText || "",
      productName: input.productName,
    });
    const storyboard = sourceStoryboard
      ? normalizePhysicalStoryboardSegment({
      storyboard: sourceStoryboard,
      productName: input.productName,
      productVisible: segment.creative_plan?.productRole !== "hidden",
      productRole: segment.creative_plan?.productRole,
        })
      : null;
    const normalizedPrompt = storyboard
      ? applyCanonicalStoryboardOverrides(segment.prompt || "", storyboard)
      : segment.prompt;
    const changed = JSON.stringify(sourceStoryboard) !== JSON.stringify(storyboard) || normalizedPrompt !== segment.prompt;
    if (storyboard && changed) {
      segment.storyboard_plan = storyboard;
      segment.prompt = normalizedPrompt;
    }
    return {
      segment,
      storyboard,
      changed,
      validation: validatePhysicalScene({
        storyboard,
        creativePlan: segment.creative_plan,
        productName: input.productName,
      }),
    };
  });

  for (const item of results.filter((entry) => entry.changed && entry.storyboard)) {
    await pool.query(
      `UPDATE omni_reel_segments
       SET storyboard_plan = $2::jsonb,
           prompt = $3,
           prompt_validation = $4::jsonb,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [item.segment.id, JSON.stringify(item.storyboard), item.segment.prompt, JSON.stringify(item.validation)]
    );
  }

  const failures = results.filter((item) => !item.validation.valid);

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
