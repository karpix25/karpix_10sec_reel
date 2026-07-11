import pool from "@/lib/db";
import { OmniLegacyScenarioLink } from "@/lib/omni/types";
import { ensureOmniSchema } from "./schema";
import { requireOmniProductInProject } from "./products";

export async function listOmniScenarioLinks(projectId: number) {
  await ensureOmniSchema();
  const { rows } = await pool.query<OmniLegacyScenarioLink>(
    `SELECT *
     FROM omni_legacy_scenario_links
     WHERE project_id = $1
     ORDER BY created_at DESC, id DESC`,
    [projectId]
  );
  return rows;
}

export async function createOmniScenarioLink(input: {
  projectId: number;
  productId?: number | null;
  legacyScenarioId: number;
  note?: unknown;
}) {
  await ensureOmniSchema();
  if (input.productId) {
    await requireOmniProductInProject(input.projectId, input.productId);
  }
  const note = typeof input.note === "string" && input.note.trim() ? input.note.trim() : null;
  if (!input.productId) {
    const existing = await pool.query<OmniLegacyScenarioLink>(
      `SELECT *
       FROM omni_legacy_scenario_links
       WHERE project_id = $1
         AND product_id IS NULL
         AND legacy_source = 'old_db'
         AND legacy_scenario_id = $2
       ORDER BY id DESC
       LIMIT 1`,
      [input.projectId, input.legacyScenarioId]
    );

    if (existing.rows[0]) {
      const { rows } = await pool.query<OmniLegacyScenarioLink>(
        `UPDATE omni_legacy_scenario_links
         SET note = COALESCE($2, note)
         WHERE id = $1
         RETURNING *`,
        [existing.rows[0].id, note]
      );
      return rows[0];
    }
  }

  const { rows } = await pool.query<OmniLegacyScenarioLink>(
    `INSERT INTO omni_legacy_scenario_links (
       project_id,
       product_id,
       legacy_source,
       legacy_scenario_id,
       note
     )
     VALUES ($1, $2, 'old_db', $3, $4)
     ON CONFLICT (project_id, product_id, legacy_source, legacy_scenario_id)
     DO UPDATE SET note = COALESCE(EXCLUDED.note, omni_legacy_scenario_links.note)
     RETURNING *`,
    [input.projectId, input.productId || null, input.legacyScenarioId, note]
  );

  return rows[0];
}
