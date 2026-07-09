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
};

export async function listLegacyScenarios(options: {
  query?: string | null;
  clientId?: number | null;
  limit: number;
  offset: number;
}) {
  const legacyPool = getLegacyPool();
  const whereClauses = [
    "COALESCE(TRIM(scenario_json->>'script'), TRIM(tts_script), '') <> ''",
    "COALESCE(scenario_json->>'script', tts_script, '') NOT ILIKE 'Error %'",
  ];
  const values: unknown[] = [];

  if (options.clientId) {
    values.push(options.clientId);
    whereClauses.push(`client_id = $${values.length}`);
  }

  if (options.query) {
    values.push(`%${options.query}%`);
    whereClauses.push(
      `(scenario_json->>'script' ILIKE $${values.length} OR tts_script ILIKE $${values.length} OR topic ILIKE $${values.length})`
    );
  }

  const whereSql = `WHERE ${whereClauses.join(" AND ")}`;
  const countResult = await legacyPool.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM generated_scenarios ${whereSql}`,
    values
  );

  const rowsResult = await legacyPool.query<LegacyScenarioRow>(
    `SELECT id, client_id, scenario_json, tts_script, topic, created_at, generation_source, source_content_id
     FROM generated_scenarios
     ${whereSql}
     ORDER BY created_at DESC, id DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, options.limit, options.offset]
  );

  return {
    data: rowsResult.rows.map(normalizeLegacyScenario),
    totalCount: Number.parseInt(countResult.rows[0]?.total || "0", 10),
  };
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
  };
}

function getSourceReference(row: LegacyScenarioRow): string | null {
  if (row.source_content_id) {
    return `source_content:${row.source_content_id}`;
  }
  return row.generation_source || null;
}
