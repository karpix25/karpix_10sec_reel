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
  legacyClientId?: number | null;
}): Promise<OmniDurationRange> {
  const linkedLegacyClientId = await getActiveProjectLegacyClientId(input.project.id, input.product.id);
  const clientIds = [
    input.project.legacy_client_id,
    linkedLegacyClientId,
    input.legacyClientId ?? null,
  ].filter((id, index, values): id is number => Boolean(id) && values.indexOf(id) === index);

  let clientRange = null;
  for (const clientId of clientIds) {
    clientRange = await getLegacyClientDurationRange(clientId);
    if (clientRange) break;
  }

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

async function getActiveProjectLegacyClientId(projectId: number, productId: number) {
  try {
    const { rows } = await pool.query<{ legacy_client_id: number | string }>(
      `SELECT legacy_client_id
       FROM omni_legacy_library_links
       WHERE project_id = $1
         AND (product_id = $2 OR product_id IS NULL)
       ORDER BY CASE WHEN product_id = $2 THEN 0 ELSE 1 END,
                created_at DESC,
                id DESC
       LIMIT 1`,
      [projectId, productId]
    );
    const clientId = Number(rows[0]?.legacy_client_id || 0);
    return Number.isFinite(clientId) && clientId > 0 ? clientId : null;
  } catch (error) {
    console.warn("Omni duration settings project link fallback:", error instanceof Error ? error.message : error);
    return null;
  }
}
