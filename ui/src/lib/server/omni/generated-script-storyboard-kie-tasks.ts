import pool from "@/lib/db";
import type { OmniStoryboardSegment } from "@/lib/omni/storyboard/omni-storyboard-types";

export async function getPendingGeneratedScriptStoryboardKieTaskId(input: {
  scriptId: number;
  segmentIndex: number;
  referenceSignature: string;
  generatorVersion: string;
}) {
  const { rows } = await pool.query<{ kie_task_id: string | null }>(
    `SELECT kie_task_id
     FROM omni_generated_script_storyboards
     WHERE generated_script_id = $1
       AND segment_index = $2
       AND reference_signature = $3
       AND generator_version = $4
       AND generation_status = 'generating'
       AND kie_task_id IS NOT NULL
     LIMIT 1`,
    [input.scriptId, input.segmentIndex, input.referenceSignature, input.generatorVersion]
  );
  const taskId = rows[0]?.kie_task_id?.trim();
  return taskId || null;
}

export async function getGeneratedScriptStoryboardRepairContext(input: {
  scriptId: number;
  segmentIndex: number;
  referenceSignature: string;
  generatorVersion: string;
}) {
  const { rows } = await pool.query<{
    repair_storyboard_reference_url: string | null;
    repair_instructions: unknown;
    generation_attempt_count: number;
  }>(
    `SELECT repair_storyboard_reference_url, repair_instructions, generation_attempt_count
     FROM omni_generated_script_storyboards
     WHERE generated_script_id = $1
       AND segment_index = $2
       AND reference_signature = $3
       AND generator_version = $4
     LIMIT 1`,
    [input.scriptId, input.segmentIndex, input.referenceSignature, input.generatorVersion]
  );
  const row = rows[0];
  return {
    previousStoryboardReferenceUrl: cleanUrl(row?.repair_storyboard_reference_url),
    previousRepairInstructions: stringArray(row?.repair_instructions),
    previousGenerationAttemptCount: Math.max(0, Number(row?.generation_attempt_count || 0)),
  };
}

export async function saveGeneratedScriptStoryboardKieTask(input: {
  projectId: number;
  productId: number;
  scriptId: number;
  segmentIndex: number;
  storyboardPlan: OmniStoryboardSegment | null;
  referenceSignature: string;
  generatorVersion: string;
  taskId: string;
  repairStoryboardReferenceUrl?: string | null;
  repairInstructions?: readonly string[];
  generationAttemptCount?: number;
}) {
  await pool.query(
    `INSERT INTO omni_generated_script_storyboards (
       project_id,
       product_id,
       generated_script_id,
       segment_index,
       storyboard_plan,
       reference_signature,
       generator_version,
       kie_task_id,
       generation_status,
       generation_attempt_count,
       repair_storyboard_reference_url,
       repair_instructions,
       generation_error,
       last_attempt_at,
       retry_after,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, 'generating', $9, $10, $11::jsonb, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (generated_script_id, segment_index)
     DO UPDATE SET
       storyboard_plan = EXCLUDED.storyboard_plan,
       reference_signature = EXCLUDED.reference_signature,
       generator_version = EXCLUDED.generator_version,
       kie_task_id = EXCLUDED.kie_task_id,
       generation_status = 'generating',
       generation_attempt_count = GREATEST(omni_generated_script_storyboards.generation_attempt_count, EXCLUDED.generation_attempt_count),
       repair_storyboard_reference_url = EXCLUDED.repair_storyboard_reference_url,
       repair_instructions = EXCLUDED.repair_instructions,
       generation_error = NULL,
       last_attempt_at = CURRENT_TIMESTAMP,
       retry_after = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP`,
    [
      input.projectId,
      input.productId,
      input.scriptId,
      input.segmentIndex,
      input.storyboardPlan ? JSON.stringify(input.storyboardPlan) : null,
      input.referenceSignature,
      input.generatorVersion,
      input.taskId,
      Math.max(1, Number(input.generationAttemptCount || 1)),
      cleanUrl(input.repairStoryboardReferenceUrl),
      JSON.stringify(stringArray(input.repairInstructions)),
    ]
  );
}

function cleanUrl(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown) {
  const values = Array.isArray(value) ? value : [];
  return values.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
}
