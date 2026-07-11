import { OmniLegacyLibrary } from "@/lib/omni/types";
import { getLegacyPool } from "./legacy-db";

type LegacyLibraryRow = Omit<OmniLegacyLibrary, "scenario_count"> & {
  scenario_count: string;
};

export async function listLegacyLibraries(options: { query?: string | null; limit: number; includeClientIds?: number[] }) {
  const legacyPool = getLegacyPool();
  const values: unknown[] = [];
  const includeClientIds = Array.from(
    new Set((options.includeClientIds || []).filter((id) => Number.isFinite(id) && id > 0))
  );
  let includeParamIndex: number | null = null;
  const whereClauses = [
    "COALESCE(TRIM(gs.scenario_json->>'script'), TRIM(gs.tts_script), '') <> ''",
    "COALESCE(gs.scenario_json->>'script', gs.tts_script, '') NOT ILIKE 'Error %'",
    "gs.client_id IS NOT NULL",
  ];

  if (includeClientIds.length) {
    values.push(includeClientIds);
    includeParamIndex = values.length;
  }

  if (options.query) {
    values.push(`%${options.query}%`);
    const queryParamIndex = values.length;
    const queryClause = `(c.name ILIKE $${queryParamIndex} OR c.product_info ILIKE $${queryParamIndex} OR c.product_keyword ILIKE $${queryParamIndex})`;
    whereClauses.push(
      includeParamIndex
        ? `(${queryClause} OR gs.client_id = ANY($${includeParamIndex}::bigint[]))`
        : queryClause
    );
  }

  const { rows } = await legacyPool.query<LegacyLibraryRow>(
    `SELECT
       gs.client_id,
       COALESCE(c.name, 'Legacy library #' || gs.client_id::text) AS name,
       c.product_info,
       c.product_keyword,
       c.niche,
       COUNT(*) AS scenario_count,
       MAX(gs.created_at) AS last_scenario_at
     FROM generated_scenarios gs
     LEFT JOIN clients c ON c.id = gs.client_id
     WHERE ${whereClauses.join(" AND ")}
     GROUP BY gs.client_id, c.name, c.product_info, c.product_keyword, c.niche
     ORDER BY ${
       includeParamIndex ? `CASE WHEN gs.client_id = ANY($${includeParamIndex}::bigint[]) THEN 0 ELSE 1 END,` : ""
     } MAX(gs.created_at) DESC, COUNT(*) DESC
     LIMIT $${values.length + 1}`,
    [...values, options.limit]
  );

  return rows.map((row) => ({
    ...row,
    client_id: Number(row.client_id),
    scenario_count: Number.parseInt(row.scenario_count || "0", 10),
  }));
}
