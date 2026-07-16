import pool from "@/lib/db";
import type { OmniProduct, OmniProject } from "@/lib/omni/types";
import { normalizeOmniDurationRange, type OmniDurationRange } from "./omni-duration-range";

type ClientDurationRow = {
  target_duration_seconds: number | null;
  target_duration_min_seconds: number | null;
  target_duration_max_seconds: number | null;
};

export async function resolveOmniDurationRange(input: {
  project: OmniProject;
  product: OmniProduct;
  requestTargetDurationSeconds?: unknown;
}): Promise<OmniDurationRange> {
  const clientRange = await getLegacyClientDurationRange(input.project.legacy_client_id);
  if (clientRange) {
    return normalizeOmniDurationRange({
      requestedMinSeconds: clientRange.target_duration_min_seconds,
      requestedMaxSeconds: clientRange.target_duration_max_seconds,
      fallbackSeconds: clientRange.target_duration_seconds,
      source: "client_settings",
    });
  }

  if (input.requestTargetDurationSeconds) {
    return normalizeOmniDurationRange({
      requestedMinSeconds: input.requestTargetDurationSeconds,
      requestedMaxSeconds: input.requestTargetDurationSeconds,
      fallbackSeconds: input.product.target_duration_seconds,
      source: "request_target",
    });
  }

  return normalizeOmniDurationRange({
    requestedMinSeconds: input.product.target_duration_seconds,
    requestedMaxSeconds: input.product.target_duration_seconds,
    fallbackSeconds: input.product.target_duration_seconds,
    source: "product_target",
  });
}

async function getLegacyClientDurationRange(legacyClientId: number | null) {
  if (!legacyClientId) return null;

  try {
    const { rows } = await pool.query<ClientDurationRow>(
      `SELECT target_duration_seconds,
              target_duration_min_seconds,
              target_duration_max_seconds
       FROM clients
       WHERE id = $1
       LIMIT 1`,
      [legacyClientId]
    );
    return rows[0] || null;
  } catch (error) {
    console.warn("Omni duration settings fallback:", error instanceof Error ? error.message : error);
    return null;
  }
}
