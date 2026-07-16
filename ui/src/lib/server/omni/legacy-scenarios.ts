import { OmniLegacyScenario } from "@/lib/omni/types";
import { getLegacyPool } from "./legacy-db";

type LegacyScenarioRow = {
  id: number;
  client_id: number | null;
  transcript: string | null;
  reels_url: string | null;
  audit_json: {
    atoms?: { verbal_hook?: string };
    pattern_framework?: { pattern_type?: string; core_thesis?: string };
    reference_strategy?: { topic_cluster?: string; topic_angle?: string };
  } | null;
  topic: string | null;
  created_at: string | null;
  word_count: number | null;
  duration_seconds: number | null;
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
    "COALESCE(TRIM(pc.transcript), '') <> ''",
    "pc.transcript NOT ILIKE 'Error %'",
  ];
  const values: unknown[] = [];

  if (options.clientId) {
    values.push(options.clientId);
    whereClauses.push(`pc.client_id = $${values.length}`);
  }

  if (options.query) {
    values.push(`%${options.query}%`);
    whereClauses.push(
      `(pc.transcript ILIKE $${values.length} OR pc.audit_json->'atoms'->>'verbal_hook' ILIKE $${values.length} OR pc.niche ILIKE $${values.length})`
    );
  }

  const whereSql = `WHERE ${whereClauses.join(" AND ")}`;
  const countResult = await legacyPool.query<{ total: string }>(
    `SELECT COUNT(*) AS total
     FROM processed_content pc
     ${whereSql}`,
    values
  );

  const rowsResult = await legacyPool.query<LegacyScenarioRow>(
    `SELECT
       pc.id,
       pc.client_id,
       pc.transcript,
       pc.reels_url,
       pc.audit_json,
       pc.niche AS topic,
       pc.created_at,
       pc.word_count,
       pc.duration_seconds,
       c.name AS legacy_client_name,
       c.product_keyword AS legacy_product_keyword
     FROM processed_content pc
     LEFT JOIN clients c ON c.id = pc.client_id
     ${whereSql}
     ORDER BY pc.created_at DESC, pc.id DESC
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
       pc.id,
       pc.client_id,
       pc.transcript,
       pc.reels_url,
       pc.audit_json,
       pc.niche AS topic,
       pc.created_at,
       pc.word_count,
       pc.duration_seconds,
       c.name AS legacy_client_name,
       c.product_keyword AS legacy_product_keyword
     FROM processed_content pc
     LEFT JOIN clients c ON c.id = pc.client_id
     WHERE pc.id = $1
     LIMIT 1`,
    [legacyScenarioId]
  );

  return rowsResult.rows[0] ? normalizeLegacyScenario(rowsResult.rows[0]) : null;
}

export async function getRandomLegacyScenarioFromClients(
  legacyClientIds: number[],
  excludedScenarioIds: number[] = []
) {
  const clientIds = Array.from(
    new Set(legacyClientIds.filter((id) => Number.isFinite(id) && id > 0))
  );
  if (!clientIds.length) return null;
  const excludedIds = Array.from(
    new Set(excludedScenarioIds.filter((id) => Number.isFinite(id) && id > 0))
  );
  const values: unknown[] = [clientIds];
  let excludeClause = "";
  if (excludedIds.length) {
    values.push(excludedIds);
    excludeClause = `AND NOT (pc.id = ANY($${values.length}::bigint[]))`;
  }

  const legacyPool = getLegacyPool();
  const rowsResult = await legacyPool.query<LegacyScenarioRow>(
    `SELECT
       pc.id,
       pc.client_id,
       pc.transcript,
       pc.reels_url,
       pc.audit_json,
       pc.niche AS topic,
       pc.created_at,
       pc.word_count,
       pc.duration_seconds,
       c.name AS legacy_client_name,
       c.product_keyword AS legacy_product_keyword
     FROM processed_content pc
     LEFT JOIN clients c ON c.id = pc.client_id
     WHERE pc.client_id = ANY($1::bigint[])
       AND COALESCE(TRIM(pc.transcript), '') <> ''
       AND pc.transcript NOT ILIKE 'Error %'
       ${excludeClause}
     ORDER BY RANDOM()
     LIMIT 1`,
    values
  );

  return rowsResult.rows[0] ? normalizeLegacyScenario(rowsResult.rows[0]) : null;
}

function normalizeLegacyScenario(row: LegacyScenarioRow): OmniLegacyScenario {
  const transcript = row.transcript || "";
  const hook = row.audit_json?.atoms?.verbal_hook || row.audit_json?.pattern_framework?.core_thesis || null;
  return {
    id: Number(row.id),
    client_id: row.client_id === null ? null : Number(row.client_id),
    script: transcript,
    title: hook,
    topic: row.topic || null,
    created_at: row.created_at,
    source_reference: getSourceReference(row),
    legacy_client_name: row.legacy_client_name || null,
    legacy_product_keyword: row.legacy_product_keyword || null,
    reels_url: row.reels_url || null,
    word_count: row.word_count === null ? null : Number(row.word_count),
    duration_seconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
  };
}

function getSourceReference(row: LegacyScenarioRow): string | null {
  if (row.id) {
    return `source_content:${row.id}`;
  }
  return row.reels_url || null;
}
