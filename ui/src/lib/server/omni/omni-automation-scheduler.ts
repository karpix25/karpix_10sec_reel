import pool from "@/lib/db";
import { normalizeOmniGenerationProvider } from "@/lib/omni/provider";
import { planOmniAutomationQueue } from "./omni-automation-limits";
import { enqueueOmniAutomationJob } from "./omni-automation-queue";
import { ensureOmniSchema } from "./schema";

const SCHEDULER_LOCK_KEY = 84244011;
const PROJECT_LIMIT_REASON = "Достигнут лимит проекта";

type AutomationProjectStats = {
  project_id: number;
  product_id: number;
  daily_reel_limit: number;
  project_reel_limit: number;
  automation_started_job_count: number;
  open_jobs: number;
  daily_job_count: number;
  total_job_count: number;
};

function envInt(name: string, fallback: number, min = 1) {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(parsed) ? Math.max(min, parsed) : fallback;
}

async function acquireSchedulerLock() {
  const client = await pool.connect();
  const { rows } = await client.query<{ locked: boolean }>(
    "SELECT pg_try_advisory_lock($1) AS locked",
    [SCHEDULER_LOCK_KEY]
  );
  if (!rows[0]?.locked) {
    client.release();
    return null;
  }
  return client;
}

async function releaseSchedulerLock(client: Awaited<ReturnType<typeof acquireSchedulerLock>>) {
  if (!client) return;
  try {
    await client.query("SELECT pg_advisory_unlock($1)", [SCHEDULER_LOCK_KEY]);
  } finally {
    client.release();
  }
}

async function listAutomationProjectStats() {
  const { rows } = await pool.query<AutomationProjectStats>(
    `SELECT
       project.id AS project_id,
       product.id AS product_id,
       GREATEST(0, COALESCE(project.daily_reel_limit, 0))::int AS daily_reel_limit,
       GREATEST(0, COALESCE(project.project_reel_limit, 0))::int AS project_reel_limit,
       GREATEST(0, COALESCE(project.automation_started_job_count, 0))::int AS automation_started_job_count,
       COUNT(job.id) FILTER (WHERE job.status IN ('queued', 'processing'))::int AS open_jobs,
       COUNT(job.id) FILTER (WHERE job.created_at >= date_trunc('day', CURRENT_TIMESTAMP))::int AS daily_job_count,
       COUNT(job.id)::int AS total_job_count
     FROM omni_projects project
     JOIN LATERAL (
       SELECT id
       FROM omni_products
       WHERE project_id = project.id
       ORDER BY updated_at DESC, id DESC
       LIMIT 1
     ) product ON TRUE
     LEFT JOIN omni_automation_jobs job ON job.project_id = project.id
     WHERE project.status = 'active'
       AND project.auto_generate_reels = TRUE
     GROUP BY project.id, product.id
     ORDER BY project.updated_at DESC, project.id DESC`
  );
  return rows;
}

async function stopProjectAutomation(projectId: number, reason = PROJECT_LIMIT_REASON) {
  await pool.query(
    `UPDATE omni_projects
     SET auto_generate_reels = FALSE,
         automation_stopped_at = CURRENT_TIMESTAMP,
         automation_stop_reason = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [projectId, reason]
  );
}

export async function runOmniAutomationSchedulerCycle() {
  await ensureOmniSchema();
  const lockClient = await acquireSchedulerLock();
  if (!lockClient) {
    return { skipped: true, queued: 0, stoppedProjects: [] as number[] };
  }

  try {
    const stats = await listAutomationProjectStats();
    const maxBatchPerProject = envInt("OMNI_AUTOMATION_SCHEDULER_BATCH_PER_PROJECT", 1);
    const maxBacklogPerProject = envInt("OMNI_AUTOMATION_QUEUE_BACKLOG_PER_PROJECT", 3);
    const provider = normalizeOmniGenerationProvider(process.env.OMNI_AUTOMATION_PROVIDER);
    const stoppedProjects: number[] = [];
    let queued = 0;

    for (const project of stats) {
      const projectJobCount = Math.max(
        0,
        Number(project.total_job_count || 0) - Number(project.automation_started_job_count || 0)
      );
      const plan = planOmniAutomationQueue({
        dailyLimit: Number(project.daily_reel_limit || 0),
        projectLimit: Number(project.project_reel_limit || 0),
        dailyJobCount: Number(project.daily_job_count || 0),
        projectJobCount,
        openJobs: Number(project.open_jobs || 0),
        maxBatchPerProject,
        maxBacklogPerProject,
      });

      if (plan.shouldStop) {
        await stopProjectAutomation(project.project_id);
        stoppedProjects.push(project.project_id);
        continue;
      }

      for (let index = 0; index < plan.toEnqueue; index += 1) {
        await enqueueOmniAutomationJob({
          projectId: project.project_id,
          productId: project.product_id,
          provider,
        });
        queued += 1;
      }

      if (plan.shouldStopAfterQueue) {
        await stopProjectAutomation(project.project_id);
        stoppedProjects.push(project.project_id);
      }
    }

    return { skipped: false, queued, stoppedProjects };
  } finally {
    await releaseSchedulerLock(lockClient);
  }
}
