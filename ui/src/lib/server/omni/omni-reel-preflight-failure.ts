import pool from "@/lib/db";
import type { OmniGenerationProvider } from "@/lib/omni/provider";

export async function markOmniReelPreflightFailure(input: {
  reelId: number;
  provider: OmniGenerationProvider;
  message: string;
}) {
  await pool.query(
    `UPDATE omni_reels
     SET status = 'failed', error_message = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [input.reelId, input.message]
  );
  await pool.query(
    `UPDATE omni_reel_segments
     SET status = 'failed', generation_provider = $2, error_message = $3, updated_at = CURRENT_TIMESTAMP
     WHERE reel_id = $1 AND status = 'draft'`,
    [input.reelId, input.provider, input.message]
  );
}

export function getSkippedReferenceReason(input: {
  role: string;
  hasCompositeReference: boolean;
  productIsVisible: boolean;
}) {
  if (
    !input.productIsVisible &&
    (input.role === "product" || input.role === "product_secondary" || input.role === "avatar_product_composite")
  ) {
    return "product_hidden_by_creative_strategy";
  }
  if (input.hasCompositeReference && input.role === "avatar") {
    return "composite_reference_sent_instead";
  }
  return "url_transport_accepts_single_input_reference";
}
