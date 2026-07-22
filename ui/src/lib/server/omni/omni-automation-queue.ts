import pool from "@/lib/db";
import { normalizeOmniGenerationProvider, type OmniGenerationProvider } from "@/lib/omni/provider";
import { ensureOmniSchema } from "./schema";

export type OmniAutomationJobStatus = "queued" | "processing" | "completed" | "failed";
export type OmniAutomationStage = "script" | "reel" | "submit" | "sync";

export type OmniAutomationJob = {
  id: number;
  project_id: number;
  product_id: number;
  source_legacy_scenario_id: number | null;
  generated_script_id: number | null;
  reel_id: number | null;
  status: OmniAutomationJobStatus;
  current_stage: OmniAutomationStage;
  priority: number;
  generation_provider: OmniGenerationProvider;
  attempt_count: number;
  max_attempts: number;
  scheduled_for: string;
  lease_until: string | null;
  worker_id: string | null;
  last_error: string | null;
  created_at: string;
  started_at: string | null;
  updated_at: string;
  completed_at: string | null;
};

function normalizeJob(row: OmniAutomationJob): OmniAutomationJob {
  return {
    ...row,
    source_legacy_scenario_id:
      row.source_legacy_scenario_id === null ? null : Number(row.source_legacy_scenario_id),
    generated_script_id: row.generated_script_id === null ? null : Number(row.generated_script_id),
    reel_id: row.reel_id === null ? null : Number(row.reel_id),
    generation_provider: normalizeOmniGenerationProvider(row.generation_provider),
  };
}

export async function enqueueOmniAutomationJob(input: {
  projectId: number;
  productId: number;
  provider?: unknown;
  priority?: number;
  sourceLegacyScenarioId?: number | null;
}) {
  await ensureOmniSchema();
  const provider = normalizeOmniGenerationProvider(input.provider);
  const { rows } = await pool.query<OmniAutomationJob>(
    `INSERT INTO omni_automation_jobs (
       project_id,
       product_id,
       source_legacy_scenario_id,
       generation_provider,
       priority
     )
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      input.projectId,
      input.productId,
      input.sourceLegacyScenarioId || null,
      provider,
      Math.max(0, Math.floor(input.priority || 0)),
    ]
  );
  return normalizeJob(rows[0]);
}

export async function claimNextOmniAutomationJob(input: {
  workerId: string;
  leaseSeconds: number;
  perProjectConcurrency: number;
}) {
  await ensureOmniSchema();
  await pool.query(
    `UPDATE omni_automation_jobs
     SET status = 'failed',
         lease_until = NULL,
         worker_id = NULL,
         last_error = COALESCE(last_error, 'Worker lease expired after max attempts'),
         completed_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE status = 'processing'
       AND lease_until < CURRENT_TIMESTAMP
       AND attempt_count >= max_attempts`
  );
  const leaseSeconds = Math.max(60, Math.floor(input.leaseSeconds || 1800));
  const perProjectConcurrency = Math.max(1, Math.floor(input.perProjectConcurrency || 1));
  const { rows } = await pool.query<OmniAutomationJob>(
    `WITH candidate AS (
       SELECT job.id
       FROM omni_automation_jobs job
       WHERE (
           (job.status = 'queued' AND job.scheduled_for <= CURRENT_TIMESTAMP)
           OR (job.status = 'processing' AND job.lease_until < CURRENT_TIMESTAMP)
         )
         AND job.attempt_count < job.max_attempts
         AND (
           SELECT COUNT(*)::int
           FROM omni_automation_jobs active
           WHERE active.project_id = job.project_id
             AND active.status = 'processing'
             AND active.lease_until >= CURRENT_TIMESTAMP
             AND active.worker_id IS DISTINCT FROM $2
         ) < $3
       ORDER BY job.priority DESC, job.scheduled_for ASC, job.id ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     UPDATE omni_automation_jobs job
     SET status = 'processing',
         attempt_count = job.attempt_count + 1,
         worker_id = $2,
         lease_until = CURRENT_TIMESTAMP + ($1 * INTERVAL '1 second'),
         started_at = COALESCE(job.started_at, CURRENT_TIMESTAMP),
         updated_at = CURRENT_TIMESTAMP
     FROM candidate
     WHERE job.id = candidate.id
     RETURNING job.*`,
    [leaseSeconds, input.workerId, perProjectConcurrency]
  );

  return rows[0] ? normalizeJob(rows[0]) : null;
}

export async function updateOmniAutomationJobStage(input: {
  jobId: number;
  stage: OmniAutomationStage;
  generatedScriptId?: number | null;
  reelId?: number | null;
}) {
  const { rows } = await pool.query<OmniAutomationJob>(
    `UPDATE omni_automation_jobs
     SET current_stage = $2,
         generated_script_id = COALESCE($3, generated_script_id),
         reel_id = COALESCE($4, reel_id),
         last_error = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [input.jobId, input.stage, input.generatedScriptId || null, input.reelId || null]
  );
  return normalizeJob(rows[0]);
}

export async function requeueOmniAutomationJob(input: {
  jobId: number;
  stage?: OmniAutomationStage;
  delaySeconds: number;
  errorMessage?: string | null;
}) {
  const { rows } = await pool.query<OmniAutomationJob>(
    `UPDATE omni_automation_jobs
     SET status = 'queued',
         current_stage = COALESCE($2, current_stage),
         scheduled_for = CURRENT_TIMESTAMP + ($3 * INTERVAL '1 second'),
         lease_until = NULL,
         worker_id = NULL,
         last_error = $4,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [input.jobId, input.stage || null, Math.max(0, Math.floor(input.delaySeconds || 0)), input.errorMessage || null]
  );
  return normalizeJob(rows[0]);
}

export async function completeOmniAutomationJob(jobId: number) {
  const { rows } = await pool.query<OmniAutomationJob>(
    `UPDATE omni_automation_jobs
     SET status = 'completed',
         lease_until = NULL,
         worker_id = NULL,
         last_error = NULL,
         completed_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [jobId]
  );
  return normalizeJob(rows[0]);
}

export async function failOmniAutomationJob(input: { jobId: number; errorMessage: string }) {
  const { rows } = await pool.query<OmniAutomationJob>(
    `UPDATE omni_automation_jobs
     SET status = 'failed',
         lease_until = NULL,
         worker_id = NULL,
         last_error = $2,
         completed_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [input.jobId, input.errorMessage]
  );
  return normalizeJob(rows[0]);
}
