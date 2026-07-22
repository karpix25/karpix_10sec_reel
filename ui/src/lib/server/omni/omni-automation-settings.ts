import pool from "@/lib/db";
import { ensureOmniSchema } from "./schema";

type SettingsRow = {
  id: number;
  auto_generate_reels: boolean;
  daily_reel_limit: number;
  project_reel_limit: number;
  automation_started_job_count: number;
  automation_stopped_at: string | null;
  automation_stop_reason: string | null;
  open_jobs: number;
  daily_job_count: number;
  project_job_count: number;
  total_job_count: number;
};

function clampLimit(value: unknown, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(10000, parsed));
}

export async function getOmniAutomationSettings(projectId: number) {
  await ensureOmniSchema();
  const { rows } = await pool.query<SettingsRow>(
    `SELECT
       project.id,
       project.auto_generate_reels,
       project.daily_reel_limit,
       project.project_reel_limit,
       project.automation_started_job_count,
       project.automation_stopped_at,
       project.automation_stop_reason,
       COUNT(job.id) FILTER (WHERE job.status IN ('queued', 'processing'))::int AS open_jobs,
       COUNT(job.id) FILTER (WHERE job.created_at >= date_trunc('day', CURRENT_TIMESTAMP))::int AS daily_job_count,
       GREATEST(0, COUNT(job.id)::int - COALESCE(project.automation_started_job_count, 0))::int AS project_job_count,
       COUNT(job.id)::int AS total_job_count
     FROM omni_projects project
     LEFT JOIN omni_automation_jobs job ON job.project_id = project.id
     WHERE project.id = $1
       AND project.status <> 'archived'
     GROUP BY project.id`,
    [projectId]
  );
  if (!rows[0]) throw new Error("Omni client project not found");
  return rows[0];
}

export async function updateOmniAutomationSettings(input: {
  projectId: number;
  autoGenerateReels?: unknown;
  dailyReelLimit?: unknown;
  projectReelLimit?: unknown;
}) {
  await ensureOmniSchema();
  const current = await getOmniAutomationSettings(input.projectId);
  const nextAuto =
    typeof input.autoGenerateReels === "boolean" ? input.autoGenerateReels : current.auto_generate_reels;
  const dailyLimit = clampLimit(input.dailyReelLimit, current.daily_reel_limit || 3);
  const projectLimit = clampLimit(input.projectReelLimit, current.project_reel_limit || 30);
  const turningOn = nextAuto && !current.auto_generate_reels;
  const turningOff = !nextAuto && current.auto_generate_reels;

  await pool.query(
    `UPDATE omni_projects
     SET auto_generate_reels = $2,
         daily_reel_limit = $3,
         project_reel_limit = $4,
         automation_started_job_count = CASE WHEN $5 THEN $7 ELSE automation_started_job_count END,
         automation_stopped_at = CASE
           WHEN $5 THEN NULL
           WHEN $6 THEN CURRENT_TIMESTAMP
           ELSE automation_stopped_at
         END,
         automation_stop_reason = CASE
           WHEN $5 THEN NULL
           WHEN $6 THEN 'Остановлено вручную'
           ELSE automation_stop_reason
         END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND status <> 'archived'`,
    [
      input.projectId,
      nextAuto,
      dailyLimit,
      projectLimit,
      turningOn,
      turningOff,
      current.total_job_count,
    ]
  );

  return getOmniAutomationSettings(input.projectId);
}
