import pool from "@/lib/db";
import type { OmniStoryboardSegment } from "@/lib/omni/storyboard/omni-storyboard-types";
import {
  resolveVersionedStoryboardKieSubmissionAction,
  type StoryboardKieSubmissionAction,
  type VersionedStoryboardKieSubmissionRow,
} from "./storyboard-kie-submission-state";

const STORYBOARD_LOCK_NAMESPACE = 53_901;

type PersistedStoryboardTask = VersionedStoryboardKieSubmissionRow;

export async function withGeneratedScriptStoryboardLock<T>(scriptId: number, run: () => Promise<T>) {
  const client = await pool.connect();
  let locked = false;
  try {
    const { rows } = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1::int, $2::int) AS locked",
      [STORYBOARD_LOCK_NAMESPACE, scriptId]
    );
    locked = Boolean(rows[0]?.locked);
    if (!locked) return null;
    return await run();
  } finally {
    if (locked) {
      await client.query("SELECT pg_advisory_unlock($1::int, $2::int)", [STORYBOARD_LOCK_NAMESPACE, scriptId]);
    }
    client.release();
  }
}

export async function reserveGeneratedScriptStoryboardKieSubmission(input: {
  projectId: number;
  productId: number;
  scriptId: number;
  segmentIndex: number;
  storyboardPlan: OmniStoryboardSegment;
  referenceSignature: string;
  generatorVersion: string;
}): Promise<StoryboardKieSubmissionAction> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<PersistedStoryboardTask>(
      `SELECT generation_status AS "generationStatus",
              generation_attempt_count AS "generationAttemptCount",
              kie_task_id AS "taskId",
              last_attempt_at AS "lastAttemptAt",
              reference_signature AS "referenceSignature",
              generator_version AS "generatorVersion"
     FROM omni_generated_script_storyboards
     WHERE generated_script_id = $1
       AND segment_index = $2
     FOR UPDATE`,
      [input.scriptId, input.segmentIndex]
    );
    const existing = rows[0] || null;
    const action = resolveVersionedStoryboardKieSubmissionAction(existing, input);
    if (action.kind !== "submit") {
      await client.query("COMMIT");
      return action;
    }

    if (!existing) {
      await client.query(
        `INSERT INTO omni_generated_script_storyboards (
           project_id, product_id, generated_script_id, segment_index, storyboard_plan,
           reference_signature, generator_version, generation_status,
           generation_attempt_count, last_attempt_at, retry_after, updated_at
         ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, 'submitting', $8, CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP)`,
        [
          input.projectId,
          input.productId,
          input.scriptId,
          input.segmentIndex,
          JSON.stringify(input.storyboardPlan),
          input.referenceSignature,
          input.generatorVersion,
          action.generationAttemptCount,
        ]
      );
    } else {
      await client.query(
        `UPDATE omni_generated_script_storyboards
         SET storyboard_plan = $3::jsonb,
             storyboard_reference_url = NULL,
             reference_signature = $4,
             generator_version = $5,
             kie_task_id = NULL,
             generation_status = 'submitting',
             generation_attempt_count = $6,
             generation_error = NULL,
             last_attempt_at = CURRENT_TIMESTAMP,
             retry_after = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE generated_script_id = $1 AND segment_index = $2`,
        [
          input.scriptId,
          input.segmentIndex,
          JSON.stringify(input.storyboardPlan),
          input.referenceSignature,
          input.generatorVersion,
          action.generationAttemptCount,
        ]
      );
    }
    await client.query("COMMIT");
    return action;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function getGeneratedScriptStoryboardRepairContext(input: {
  scriptId: number;
  segmentIndex: number;
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
     LIMIT 1`,
    [input.scriptId, input.segmentIndex]
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
