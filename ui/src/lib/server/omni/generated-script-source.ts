import type { OmniLegacyScenario } from "@/lib/omni/types";
import pool from "@/lib/db";
import { getLegacyScenario, getNextLegacyScenarioFromClients } from "./legacy-scenarios";
import { listLegacyLibraryLinks } from "./legacy-library-links";
import { listNonRetryableFailedDirectorAnalysisLegacyIds } from "./director-analyses";

export type GeneratedScriptSourceMode =
  | "round_robin_active_legacy_reference"
  | "selected_legacy_reference";

export async function advanceGeneratedScriptSourceCursor(input: {
  projectId: number;
  productId: number;
  legacyScenarioId: number;
}) {
  await pool.query(
    `WITH cursor_update AS (
       INSERT INTO omni_generated_script_source_cursors (
       project_id, product_id, legacy_scenario_id, updated_at
       )
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (project_id, product_id)
       DO UPDATE SET legacy_scenario_id = EXCLUDED.legacy_scenario_id,
                     updated_at = CURRENT_TIMESTAMP
       RETURNING 1
     )
     INSERT INTO omni_generated_script_source_attempts (
       project_id, product_id, legacy_scenario_id, attempted_at
     )
     SELECT $1, $2, $3, CURRENT_TIMESTAMP FROM cursor_update
     ON CONFLICT (project_id, product_id, legacy_scenario_id)
     DO UPDATE SET attempted_at = CURRENT_TIMESTAMP`,
    [input.projectId, input.productId, input.legacyScenarioId]
  );
}

export async function resolveGeneratedScriptSource(input: {
  projectId: number;
  productId: number;
  legacyScenarioId?: number | null;
  excludedLegacyScenarioIds?: readonly number[];
}): Promise<{
  sourceScenario: OmniLegacyScenario;
  sourceMode: GeneratedScriptSourceMode;
}> {
  const legacyClientIds = await listActiveLegacyClientIds(input.projectId, input.productId);
  if (!legacyClientIds.length) {
    throw new Error("No active legacy bundles for this project");
  }

  const excludedIds = normalizeExcludedIds(input.excludedLegacyScenarioIds);

  if (input.legacyScenarioId && !excludedIds.includes(input.legacyScenarioId)) {
    const sourceScenario = await getLegacyScenario(input.legacyScenarioId);
    if (!sourceScenario || !sourceScenario.script.trim()) {
      throw new Error("Selected legacy scenario was not found");
    }
    if (!sourceScenario.client_id || !legacyClientIds.includes(sourceScenario.client_id)) {
      throw new Error("Selected legacy scenario is not from an active legacy bundle");
    }
    return { sourceScenario, sourceMode: "selected_legacy_reference" };
  }

  const failedDirectorIds = await listNonRetryableFailedDirectorAnalysisLegacyIds();
  const attemptedIds = await listGeneratedScriptSourceAttemptIds(input.projectId, input.productId);
  const lastSelectedScenarioId = await getGeneratedScriptSourceCursor(input.projectId, input.productId) ??
    await getLastGeneratedScriptSourceId(input.projectId, input.productId);
  const sourceScenario = await getNextLegacyScenarioFromClients(
    legacyClientIds,
    lastSelectedScenarioId,
    [...failedDirectorIds, ...attemptedIds, ...excludedIds],
  );
  if (!sourceScenario) {
    throw new Error("No reference transcripts found in active legacy bundles");
  }
  return { sourceScenario, sourceMode: "round_robin_active_legacy_reference" };
}

async function listGeneratedScriptSourceAttemptIds(projectId: number, productId: number) {
  const { rows } = await pool.query<{ legacy_scenario_id: number | string }>(
    `SELECT legacy_scenario_id
     FROM omni_generated_script_source_attempts
     WHERE project_id = $1
       AND product_id = $2`,
    [projectId, productId]
  );
  return rows.map((row) => Number(row.legacy_scenario_id)).filter(Number.isFinite);
}

async function getGeneratedScriptSourceCursor(projectId: number, productId: number) {
  const { rows } = await pool.query<{ legacy_scenario_id: number | string }>(
    `SELECT legacy_scenario_id
     FROM omni_generated_script_source_cursors
     WHERE project_id = $1
       AND product_id = $2`,
    [projectId, productId]
  );
  const sourceId = rows[0]?.legacy_scenario_id;
  return sourceId === undefined ? null : Number(sourceId);
}

async function getLastGeneratedScriptSourceId(projectId: number, productId: number) {
  const { rows } = await pool.query<{ source_legacy_scenario_id: number | string }>(
    `SELECT source_legacy_scenario_id
     FROM omni_generated_scripts
     WHERE project_id = $1
       AND product_id = $2
       AND status <> 'archived'
       AND source_legacy_scenario_id IS NOT NULL
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [projectId, productId],
  );
  const sourceId = rows[0]?.source_legacy_scenario_id;
  return sourceId === undefined ? null : Number(sourceId);
}

function normalizeExcludedIds(ids: readonly number[] = []) {
  return Array.from(new Set(ids.filter((id) => Number.isFinite(id) && id > 0)));
}

async function listActiveLegacyClientIds(projectId: number, productId: number) {
  const projectLinks = await listLegacyLibraryLinks(projectId, null);
  const productLinks = await listLegacyLibraryLinks(projectId, productId);
  return Array.from(
    new Set(
      [...projectLinks, ...productLinks]
        .map((link) => link.legacy_client_id)
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  );
}
