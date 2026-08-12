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

export async function saveGeneratedScriptStoryboardKieTask(input: {
  projectId: number;
  productId: number;
  scriptId: number;
  segmentIndex: number;
  storyboardPlan: OmniStoryboardSegment | null;
  referenceSignature: string;
  generatorVersion: string;
  taskId: string;
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
       generation_error,
       last_attempt_at,
       retry_after,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, 'generating', 0, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (generated_script_id, segment_index)
     DO UPDATE SET
       storyboard_plan = EXCLUDED.storyboard_plan,
       reference_signature = EXCLUDED.reference_signature,
       generator_version = EXCLUDED.generator_version,
       kie_task_id = EXCLUDED.kie_task_id,
       generation_status = 'generating',
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
    ]
  );
}
