import pool from "@/lib/db";
import type { OmniGeneratedScript } from "@/lib/omni/types";
import { LlmPromptChainFailure } from "./llm-prompt-chain-runner";

const STALE_GENERATION_MINUTES = 30;

export async function failStaleGeneratedScriptGenerations(projectId: number, productId?: number | null) {
  await pool.query(
    `UPDATE omni_generated_scripts
     SET status = 'failed',
         source_snapshot = COALESCE(source_snapshot, '{}'::jsonb) || $3::jsonb,
         updated_at = CURRENT_TIMESTAMP
     WHERE project_id = $1
       AND ($2::int IS NULL OR product_id = $2)
       AND status = 'generating'
       AND updated_at < CURRENT_TIMESTAMP - ($4::int * INTERVAL '1 minute')`,
    [
      projectId,
      productId || null,
      JSON.stringify({
        generation_stage: "llm_prompt_chain",
        generation_error: `Генерация не завершилась за ${STALE_GENERATION_MINUTES} минут и была остановлена`,
      }),
      STALE_GENERATION_MINUTES,
    ]
  );
}

export async function createGeneratedScriptGenerationRecord(input: {
  projectId: number;
  productId: number;
  sourceLegacyScenarioId: number;
  sourceLegacyClientId: number | null;
  directorAnalysisId: number | null;
  title: string | null;
  sourceSnapshot: Record<string, unknown>;
  productSnapshot: Record<string, unknown>;
  model: string;
}) {
  const { rows } = await pool.query<OmniGeneratedScript>(
    `INSERT INTO omni_generated_scripts (
       project_id, product_id, source_legacy_scenario_id, source_legacy_client_id,
       director_analysis_id, status, title, script, source_snapshot, product_snapshot, model, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, 'generating', $6, '', $7::jsonb, $8::jsonb, $9, CURRENT_TIMESTAMP)
     RETURNING *`,
    [
      input.projectId,
      input.productId,
      input.sourceLegacyScenarioId,
      input.sourceLegacyClientId,
      input.directorAnalysisId,
      input.title,
      JSON.stringify({ ...input.sourceSnapshot, generation_stage: "content_adaptation", generation_error: null }),
      JSON.stringify(input.productSnapshot),
      input.model,
    ]
  );
  return rows[0];
}

export async function updateGeneratedScriptGenerationSnapshot(scriptId: number, patch: Record<string, unknown>) {
  await pool.query(
    `UPDATE omni_generated_scripts
     SET source_snapshot = COALESCE(source_snapshot, '{}'::jsonb) || $2::jsonb,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [scriptId, JSON.stringify(patch)]
  );
}

export async function failGeneratedScriptGeneration(scriptId: number, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const chainFailure = error instanceof LlmPromptChainFailure ? error : null;
  await pool.query(
    `UPDATE omni_generated_scripts
     SET status = 'failed',
         script = $3,
         source_snapshot = COALESCE(source_snapshot, '{}'::jsonb) || $2::jsonb,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [
      scriptId,
      JSON.stringify({
        generation_stage: chainFailure?.stage || inferGenerationStage(message),
        generation_error: message,
        llm_prompt_chain_partial: chainFailure?.partialSnapshot || null,
      }),
      chainFailure?.partialSnapshot.creativeScriptDraft?.script || "",
    ]
  );
}

function inferGenerationStage(message: string) {
  if (message.startsWith("Reference нельзя честно адаптировать")) return "content_adaptation";
  if (message.startsWith("Creative copywriter failed")) return "creative_copywriter";
  if (message.startsWith("Director segmenter failed")) return "director_segmenter";
  if (message.startsWith("Сценарий отклонен")) return "script_validation";
  return "llm_prompt_chain";
}
