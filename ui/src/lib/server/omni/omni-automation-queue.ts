import pool from "@/lib/db";
import { normalizeOmniGenerationProvider, type OmniGenerationProvider } from "@/lib/omni/provider";
import { planOmniAutomationQueue } from "./omni-automation-limits";
import { ensureOmniSchema } from "./schema";
import type { PoolClient } from "pg";

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
  quota_day: string;
  lease_until: string | null;
  worker_id: string | null;
  last_error: string | null;
  created_at: string;
  started_at: string | null;
  updated_at: string;
  completed_at: string | null;
  success_verified_at: string | null;
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

async function getOmniAutomationJob(jobId: number) {
  const { rows } = await pool.query<OmniAutomationJob>(
    "SELECT * FROM omni_automation_jobs WHERE id = $1",
    [jobId]
  );
  if (!rows[0]) throw new Error("Omni automation job not found");
  return normalizeJob(rows[0]);
}

type QuotaCounts = {
  successful_today: number;
  successful_project: number;
  reserved_today: number;
  reserved_project: number;
};

async function readQuotaCounts(client: PoolClient, projectId: number) {
  const { rows } = await client.query<QuotaCounts>(
    `SELECT
       COUNT(*) FILTER (
         WHERE job.status = 'completed'
           AND job.success_verified_at IS NOT NULL
           AND job.quota_day = (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow')::date
       )::int AS successful_today,
       COUNT(*) FILTER (
         WHERE job.status = 'completed'
           AND job.success_verified_at IS NOT NULL
       )::int AS successful_project,
       COUNT(*) FILTER (
         WHERE job.status IN ('queued', 'processing')
           AND job.quota_day = (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow')::date
       )::int AS reserved_today,
       COUNT(*) FILTER (
         WHERE job.status IN ('queued', 'processing')
       )::int AS reserved_project
     FROM omni_automation_jobs job
     WHERE job.project_id = $1`,
    [projectId]
  );
  return {
    successfulToday: Number(rows[0]?.successful_today || 0),
    successfulProject: Number(rows[0]?.successful_project || 0),
    reservedToday: Number(rows[0]?.reserved_today || 0),
    reservedProject: Number(rows[0]?.reserved_project || 0),
  };
}

async function selectNextProduct(client: PoolClient, projectId: number, excludedProductIds: number[]) {
  const { rows } = await client.query<{ id: number }>(
    `SELECT product.id
     FROM omni_products product
     LEFT JOIN omni_automation_jobs recent_job
       ON recent_job.project_id = product.project_id
      AND recent_job.product_id = product.id
     WHERE product.project_id = $1
       AND NOT (product.id = ANY($2::bigint[]))
     GROUP BY product.id
     ORDER BY MAX(recent_job.created_at) ASC NULLS FIRST, product.id ASC
     LIMIT 1`,
    [projectId, excludedProductIds]
  );
  return rows[0]?.id || null;
}

export async function reserveOmniAutomationJobs(input: {
  projectId: number;
  count: number;
  provider?: unknown;
  productId?: number | null;
  priority?: number;
  sourceLegacyScenarioId?: number | null;
  generatedScriptId?: number | null;
  maxBacklogPerProject?: number;
  requireAutomationEnabled?: boolean;
}) {
  await ensureOmniSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const projectResult = await client.query<{
      id: number;
      auto_generate_reels: boolean;
      daily_reel_limit: number;
      project_reel_limit: number;
    }>(
      `SELECT id, auto_generate_reels, daily_reel_limit, project_reel_limit
       FROM omni_projects
       WHERE id = $1 AND status = 'active'
       FOR UPDATE`,
      [input.projectId]
    );
    const project = projectResult.rows[0];
    if (!project) throw new Error("Omni client project not found");

    const counts = await readQuotaCounts(client, input.projectId);
    const projectLimit = Math.max(0, Number(project.project_reel_limit || 0));
    if (counts.successfulProject >= projectLimit && projectLimit > 0) {
      await client.query(
        `UPDATE omni_projects
         SET auto_generate_reels = FALSE,
             automation_stopped_at = CURRENT_TIMESTAMP,
             automation_stop_reason = 'Достигнут лимит проекта',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [input.projectId]
      );
      await client.query("COMMIT");
      return { jobs: [], stopped: true, counts, projectLimit };
    }

    if (input.requireAutomationEnabled && !project.auto_generate_reels) {
      await client.query("COMMIT");
      return { jobs: [], stopped: false, counts, projectLimit };
    }

    const plan = planOmniAutomationQueue({
      dailyLimit: Number(project.daily_reel_limit || 0),
      projectLimit,
      dailyJobCount: counts.successfulToday + counts.reservedToday,
      projectJobCount: counts.successfulProject + counts.reservedProject,
      successfulProjectCount: counts.successfulProject,
      openJobs: counts.reservedProject,
      maxBatchPerProject: Math.max(1, Math.floor(input.count || 0)),
      maxBacklogPerProject: Math.max(1, Math.floor(input.maxBacklogPerProject || 3)),
    });

    const provider = normalizeOmniGenerationProvider(input.provider);
    const jobs: OmniAutomationJob[] = [];
    const reservationCount = input.generatedScriptId ? Math.min(1, plan.toEnqueue) : plan.toEnqueue;
    const selectedProductIds = new Set<number>();
    for (let index = 0; index < reservationCount; index += 1) {
      let productId = input.productId || null;
      if (productId) {
        const productResult = await client.query<{ id: number }>(
          `SELECT id FROM omni_products WHERE id = $1 AND project_id = $2 FOR SHARE`,
          [productId, input.projectId]
        );
        if (!productResult.rows[0]) throw new Error("Omni product does not belong to project");
      } else {
        productId = await selectNextProduct(client, input.projectId, [...selectedProductIds]);
        if (!productId && selectedProductIds.size) {
          selectedProductIds.clear();
          productId = await selectNextProduct(client, input.projectId, []);
        }
      }
      if (!productId) break;
      if (!input.productId) selectedProductIds.add(productId);

      const { rows } = await client.query<OmniAutomationJob>(
        `INSERT INTO omni_automation_jobs (
           project_id,
           product_id,
           source_legacy_scenario_id,
           generated_script_id,
           generation_provider,
           priority,
           quota_day
         )
         VALUES ($1, $2, $3, $4, $5, $6, (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow')::date)
         ON CONFLICT (generated_script_id)
         WHERE generated_script_id IS NOT NULL
           AND status IN ('queued', 'processing')
         DO UPDATE SET updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [
          input.projectId,
          productId,
          input.sourceLegacyScenarioId || null,
          input.generatedScriptId || null,
          provider,
          Math.max(0, Math.floor(input.priority || 0)),
        ]
      );
      if (rows[0]) jobs.push(normalizeJob(rows[0]));
    }

    await client.query("COMMIT");
    return { jobs, stopped: false, counts, projectLimit };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function enqueueOmniAutomationJob(input: {
  projectId: number;
  productId: number;
  provider?: unknown;
  priority?: number;
  sourceLegacyScenarioId?: number | null;
  generatedScriptId?: number | null;
}) {
  const reservation = await reserveOmniAutomationJobs({
    ...input,
    count: 1,
    maxBacklogPerProject: 3,
  });
  return reservation.jobs[0] || null;
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
           OR (
             job.status = 'processing'
             AND job.worker_id = $2
             AND job.generated_script_id IS NOT NULL
             AND job.updated_at < CURRENT_TIMESTAMP - INTERVAL '60 seconds'
           )
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
         attempt_count = CASE
           WHEN job.current_stage = 'sync' OR (job.status = 'processing' AND job.worker_id = $2)
             THEN job.attempt_count
           ELSE job.attempt_count + 1
         END,
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
       AND status NOT IN ('completed', 'failed')
       RETURNING *`,
    [input.jobId, input.stage, input.generatedScriptId || null, input.reelId || null]
  );
  return rows[0] ? normalizeJob(rows[0]) : getOmniAutomationJob(input.jobId);
}

export async function requeueOmniAutomationJob(input: {
  jobId: number;
  stage?: OmniAutomationStage;
  delaySeconds: number;
  errorMessage?: string | null;
  refundAttempt?: boolean;
}) {
  const { rows } = await pool.query<OmniAutomationJob>(
    `UPDATE omni_automation_jobs
     SET status = 'queued',
         current_stage = COALESCE($2, current_stage),
         scheduled_for = CURRENT_TIMESTAMP + ($3 * INTERVAL '1 second'),
         lease_until = NULL,
         worker_id = NULL,
         attempt_count = CASE WHEN $5 THEN GREATEST(0, attempt_count - 1) ELSE attempt_count END,
         last_error = $4,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND status NOT IN ('completed', 'failed')
       RETURNING *`,
    [
      input.jobId,
      input.stage || null,
      Math.max(0, Math.floor(input.delaySeconds || 0)),
      input.errorMessage || null,
      Boolean(input.refundAttempt),
    ]
  );
  return rows[0] ? normalizeJob(rows[0]) : getOmniAutomationJob(input.jobId);
}

export async function completeOmniAutomationJob(jobId: number) {
  await ensureOmniSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const jobRef = await client.query<{ project_id: number }>(
      "SELECT project_id FROM omni_automation_jobs WHERE id = $1",
      [jobId]
    );
    const projectId = jobRef.rows[0]?.project_id;
    if (!projectId) throw new Error("Omni automation job not found");

    const projectResult = await client.query<{ project_reel_limit: number }>(
      "SELECT project_reel_limit FROM omni_projects WHERE id = $1 FOR UPDATE",
      [projectId]
    );
    const jobResult = await client.query<{
      project_id: number;
      reel_id: number | null;
      status: OmniAutomationJobStatus;
      success_verified_at: string | null;
      final_video_verified_at: string | null;
    }>(
      `SELECT job.*, reel.final_video_verified_at
       FROM omni_automation_jobs job
       LEFT JOIN omni_reels reel ON reel.id = job.reel_id
       WHERE job.id = $1
       FOR UPDATE OF job`,
      [jobId]
    );
    const job = jobResult.rows[0];
    if (!job) throw new Error("Omni automation job not found");
    if (job.status === "failed") {
      throw new Error("Cannot complete failed Omni automation job");
    }
    if (!job.success_verified_at && !job.final_video_verified_at) {
      throw new Error("Cannot complete Omni automation job before final video verification");
    }

    const { rows } = await client.query<OmniAutomationJob>(
      `UPDATE omni_automation_jobs
       SET status = 'completed',
           lease_until = NULL,
           worker_id = NULL,
           last_error = NULL,
           completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
           success_verified_at = COALESCE(success_verified_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [jobId]
    );

    const projectLimit = Number(projectResult.rows[0]?.project_reel_limit || 0);
    if (projectLimit > 0) {
      const successResult = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count
         FROM omni_automation_jobs
         WHERE project_id = $1
           AND status = 'completed'
           AND success_verified_at IS NOT NULL`,
        [projectId]
      );
      if (Number(successResult.rows[0]?.count || 0) >= projectLimit) {
        await client.query(
          `UPDATE omni_projects
           SET auto_generate_reels = FALSE,
               automation_stopped_at = CURRENT_TIMESTAMP,
               automation_stop_reason = 'Достигнут лимит проекта',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [projectId]
        );
      }
    }

    await client.query("COMMIT");
    return normalizeJob(rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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
       AND status NOT IN ('completed', 'failed')
       RETURNING *`,
    [input.jobId, input.errorMessage]
  );
  return rows[0] ? normalizeJob(rows[0]) : getOmniAutomationJob(input.jobId);
}
