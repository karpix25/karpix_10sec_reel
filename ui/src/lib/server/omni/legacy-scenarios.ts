import { OmniLegacyScenario } from "@/lib/omni/types";
import { getLegacyPool } from "./legacy-db";

type LegacyScenarioRow = {
  id: number;
  client_id: number | null;
  scenario_json: { script?: string; title?: string; hook?: string } | null;
  tts_script: string | null;
  topic: string | null;
  created_at: string | null;
  generation_source: string | null;
  source_content_id: number | null;
  legacy_client_name: string | null;
  legacy_product_keyword: string | null;
};

export async function listLegacyScenarios(options: {
  query?: string | null;
  clientId?: number | null;
  limit: number;
  offset: number;
}) {
  const legacyPool = getLegacyPool();
  const whereClauses = [
    "COALESCE(TRIM(gs.scenario_json->>'script'), TRIM(gs.tts_script), '') <> ''",
    "COALESCE(gs.scenario_json->>'script', gs.tts_script, '') NOT ILIKE 'Error %'",
  ];
  const values: unknown[] = [];

  if (options.clientId) {
    values.push(options.clientId);
    whereClauses.push(`gs.client_id = $${values.length}`);
  }

  if (options.query) {
    values.push(`%${options.query}%`);
    whereClauses.push(
      `(gs.scenario_json->>'script' ILIKE $${values.length} OR gs.tts_script ILIKE $${values.length} OR gs.topic ILIKE $${values.length})`
    );
  }

  const whereSql = `WHERE ${whereClauses.join(" AND ")}`;
  const countResult = await legacyPool.query<{ total: string }>(
    `SELECT COUNT(*) AS total
     FROM generated_scenarios gs
     ${whereSql}`,
    values
  );

  const rowsResult = await legacyPool.query<LegacyScenarioRow>(
    `SELECT
       gs.id,
       gs.client_id,
       gs.scenario_json,
       gs.tts_script,
       gs.topic,
       gs.created_at,
       gs.generation_source,
       gs.source_content_id,
       c.name AS legacy_client_name,
       c.product_keyword AS legacy_product_keyword
     FROM generated_scenarios gs
     LEFT JOIN clients c ON c.id = gs.client_id
     ${whereSql}
     ORDER BY gs.created_at DESC, gs.id DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, options.limit, options.offset]
  );

  return {
    data: rowsResult.rows.map(normalizeLegacyScenario),
    totalCount: Number.parseInt(countResult.rows[0]?.total || "0", 10),
  };
}

export async function getLegacyScenario(legacyScenarioId: number) {
  const legacyPool = getLegacyPool();
  const rowsResult = await legacyPool.query<LegacyScenarioRow>(
    `SELECT
       gs.id,
       gs.client_id,
       gs.scenario_json,
       gs.tts_script,
       gs.topic,
       gs.created_at,
       gs.generation_source,
       gs.source_content_id,
       c.name AS legacy_client_name,
       c.product_keyword AS legacy_product_keyword
     FROM generated_scenarios gs
     LEFT JOIN clients c ON c.id = gs.client_id
     WHERE gs.id = $1
     LIMIT 1`,
    [legacyScenarioId]
  );

  return rowsResult.rows[0] ? normalizeLegacyScenario(rowsResult.rows[0]) : null;
}

function normalizeLegacyScenario(row: LegacyScenarioRow): OmniLegacyScenario {
  const script = row.scenario_json?.script || row.tts_script || "";
  return {
    id: Number(row.id),
    client_id: row.client_id === null ? null : Number(row.client_id),
    script,
    title: row.scenario_json?.title || row.scenario_json?.hook || null,
    topic: row.topic || null,
    created_at: row.created_at,
    source_reference: getSourceReference(row),
    legacy_client_name: row.legacy_client_name || null,
    legacy_product_keyword: row.legacy_product_keyword || null,
  };
}

function getSourceReference(row: LegacyScenarioRow): string | null {
  if (row.source_content_id) {
    return `source_content:${row.source_content_id}`;
  }
  return row.generation_source || null;
}
