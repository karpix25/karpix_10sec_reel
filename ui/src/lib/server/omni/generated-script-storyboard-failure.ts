import pool from "@/lib/db";
import type { OmniStoryboardSegment } from "@/lib/omni/storyboard/omni-storyboard-types";

const MAX_STORYBOARD_DIAGNOSTIC_CHARS = 12_000;

type StoryboardFailureInput = {
  projectId: number;
  productId: number;
  scriptId: number;
  segmentIndex: number;
  storyboardPlan: OmniStoryboardSegment | null;
  referenceSignature: string;
  generatorVersion: string;
};

export async function recordGeneratedScriptStoryboardFailure(input: StoryboardFailureInput, error: unknown) {
  const reason = error instanceof Error ? error.message : String(error);
  const repair = getStoryboardRepairDetails(error);
  const rawResponse = getRawResponse(error);
  const diagnostic = {
    at: new Date().toISOString(),
    reason: truncateStoryboardDiagnostic(reason),
    raw_response: rawResponse ? truncateStoryboardDiagnostic(rawResponse) : null,
  };
  const { rows } = await pool.query<{ generation_attempt_count: number; diagnostic_attempt_count: number }>(
    `INSERT INTO omni_generated_script_storyboards (
       project_id, product_id, generated_script_id, segment_index, storyboard_plan,
       reference_signature, generator_version, kie_task_id, generation_status,
       generation_attempt_count, repair_storyboard_reference_url, repair_instructions,
       generation_error, generation_error_history, last_attempt_at, retry_after, updated_at
     )
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, NULL, 'failed', $8, $9, $10::jsonb, $11, $12::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '5 seconds', CURRENT_TIMESTAMP)
     ON CONFLICT (generated_script_id, segment_index)
     DO UPDATE SET
       storyboard_plan = EXCLUDED.storyboard_plan,
       reference_signature = EXCLUDED.reference_signature,
       generator_version = EXCLUDED.generator_version,
       kie_task_id = NULL,
       generation_status = EXCLUDED.generation_status,
       generation_attempt_count = GREATEST(omni_generated_script_storyboards.generation_attempt_count, $13::int),
       repair_storyboard_reference_url = COALESCE(EXCLUDED.repair_storyboard_reference_url, omni_generated_script_storyboards.repair_storyboard_reference_url),
       repair_instructions = CASE
         WHEN jsonb_array_length(EXCLUDED.repair_instructions) > 0 THEN EXCLUDED.repair_instructions
         ELSE omni_generated_script_storyboards.repair_instructions
       END,
       generation_error = EXCLUDED.generation_error,
       generation_error_history = (
         SELECT COALESCE(jsonb_agg(entry ORDER BY position), '[]'::jsonb)
         FROM (
           SELECT entry, position
           FROM jsonb_array_elements(omni_generated_script_storyboards.generation_error_history || EXCLUDED.generation_error_history)
                WITH ORDINALITY AS history(entry, position)
           ORDER BY position DESC
           LIMIT 3
         ) AS recent
       ),
       last_attempt_at = CURRENT_TIMESTAMP,
       retry_after = CURRENT_TIMESTAMP + INTERVAL '5 seconds',
       updated_at = CURRENT_TIMESTAMP
     RETURNING generation_attempt_count, jsonb_array_length(generation_error_history) AS diagnostic_attempt_count`,
    [
      input.projectId,
      input.productId,
      input.scriptId,
      input.segmentIndex,
      input.storyboardPlan ? JSON.stringify(input.storyboardPlan) : null,
      input.referenceSignature,
      input.generatorVersion,
      repair.generationAttemptCount,
      repair.referenceUrl,
      JSON.stringify(repair.instructions),
      truncateStoryboardDiagnostic(reason),
      JSON.stringify([diagnostic]),
      repair.generationAttemptCount,
    ]
  );
  return {
    generationAttemptCount: Number(rows[0]?.generation_attempt_count || 0),
    diagnosticAttemptCount: Number(rows[0]?.diagnostic_attempt_count || 1),
  };
}

function getStoryboardRepairDetails(error: unknown) {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const generationAttemptCount = Number(value.generationAttemptCount || value.storyboardGenerationAttemptCount || 0);
  const referenceUrl = typeof value.storyboardRepairReferenceUrl === "string"
    ? value.storyboardRepairReferenceUrl.trim() || null
    : null;
  const instructions = Array.isArray(value.storyboardRepairInstructions)
    ? value.storyboardRepairInstructions.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim())
    : [];
  return {
    generationAttemptCount: Number.isFinite(generationAttemptCount) ? Math.max(0, Math.floor(generationAttemptCount)) : 0,
    referenceUrl,
    instructions,
  };
}

function getRawResponse(error: unknown) {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  return typeof value.rawResponse === "string" && value.rawResponse.trim() ? value.rawResponse : null;
}

function truncateStoryboardDiagnostic(value: string) {
  return value.length <= MAX_STORYBOARD_DIAGNOSTIC_CHARS
    ? value
    : `${value.slice(0, MAX_STORYBOARD_DIAGNOSTIC_CHARS)}\n[truncated]`;
}
