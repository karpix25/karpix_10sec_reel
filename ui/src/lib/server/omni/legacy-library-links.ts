import pool from "@/lib/db";
import { OmniLegacyLibraryLink } from "@/lib/omni/types";
import { ensureOmniSchema } from "./schema";

export async function listLegacyLibraryLinks(projectId: number, productId?: number | null) {
  await ensureOmniSchema();
  const values: unknown[] = [projectId];
  const clauses = ["project_id = $1"];

  if (productId) {
    values.push(productId);
    clauses.push(`product_id = $${values.length}`);
  }

  const { rows } = await pool.query<OmniLegacyLibraryLink>(
    `SELECT *
     FROM omni_legacy_library_links
     WHERE ${clauses.join(" AND ")}
     ORDER BY created_at DESC, id DESC`,
    values
  );
  return rows;
}

export async function linkLegacyLibrary(input: {
  projectId: number;
  productId?: number | null;
  legacyClientId: number;
}) {
  await ensureOmniSchema();
  const { rows } = await pool.query<OmniLegacyLibraryLink>(
    `INSERT INTO omni_legacy_library_links (
       project_id,
       product_id,
       legacy_client_id
     )
     VALUES ($1, $2, $3)
     ON CONFLICT (project_id, product_id, legacy_client_id)
     DO UPDATE SET legacy_client_id = EXCLUDED.legacy_client_id
     RETURNING *`,
    [input.projectId, input.productId || null, input.legacyClientId]
  );
  return rows[0];
}
