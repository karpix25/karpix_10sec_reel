import pool from "@/lib/db";
import { normalizeOmniGenerationProvider } from "@/lib/omni/provider";
import { reserveOmniAutomationJobs } from "./omni-automation-queue";
import { ensureOmniSchema } from "./schema";

const SCHEDULER_LOCK_KEY = 84244011;

type AutomationProject = {
  project_id: number;
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

async function listAutomationProjects() {
  const { rows } = await pool.query<AutomationProject>(
    `SELECT
       project.id AS project_id
     FROM omni_projects project
     WHERE project.status = 'active'
       AND project.auto_generate_reels = TRUE
     ORDER BY project.updated_at DESC, project.id DESC`
  );
  return rows;
}

export async function runOmniAutomationSchedulerCycle() {
  await ensureOmniSchema();
  const lockClient = await acquireSchedulerLock();
  if (!lockClient) {
    return { skipped: true, queued: 0, stoppedProjects: [] as number[] };
  }

  try {
    const projects = await listAutomationProjects();
    const maxBatchPerProject = envInt("OMNI_AUTOMATION_SCHEDULER_BATCH_PER_PROJECT", 1);
    const maxBacklogPerProject = envInt("OMNI_AUTOMATION_QUEUE_BACKLOG_PER_PROJECT", 3);
    const provider = normalizeOmniGenerationProvider(process.env.OMNI_AUTOMATION_PROVIDER);
    const stoppedProjects: number[] = [];
    let queued = 0;

    for (const project of projects) {
      const reservation = await reserveOmniAutomationJobs({
        projectId: project.project_id,
        count: maxBatchPerProject,
        provider,
        maxBacklogPerProject,
        requireAutomationEnabled: true,
      });
      queued += reservation.jobs.length;
      if (reservation.stopped) stoppedProjects.push(project.project_id);
    }

    return { skipped: false, queued, stoppedProjects };
  } finally {
    await releaseSchedulerLock(lockClient);
  }
}
