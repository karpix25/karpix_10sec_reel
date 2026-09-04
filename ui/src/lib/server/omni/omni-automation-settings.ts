import pool from "@/lib/db";
import { OMNI_GENERATION_PROVIDERS, normalizeOmniGenerationProvider, type OmniGenerationProvider } from "@/lib/omni/provider";
import { ensureOmniSchema } from "./schema";

type SettingsRow = {
  id: number;
  auto_generate_reels: boolean;
  automation_provider: OmniGenerationProvider | null;
  daily_reel_limit: number;
  project_reel_limit: number;
  automation_started_job_count: number;
  automation_stopped_at: string | null;
  automation_stop_reason: string | null;
  open_jobs: number;
  daily_job_count: number;
  project_job_count: number;
  total_job_count: number;
  daily_reserved_count: number;
  project_reserved_count: number;
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
       project.automation_provider,
       project.daily_reel_limit,
       project.project_reel_limit,
       project.automation_started_job_count,
       project.automation_stopped_at,
       project.automation_stop_reason,
       COUNT(job.id) FILTER (WHERE job.status IN ('queued', 'processing'))::int AS open_jobs,
       COUNT(job.id) FILTER (
         WHERE job.status = 'completed'
           AND job.success_verified_at IS NOT NULL
           AND job.quota_day = (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow')::date
       )::int AS daily_job_count,
       COUNT(job.id) FILTER (
         WHERE job.status = 'completed'
           AND job.success_verified_at IS NOT NULL
       )::int AS project_job_count,
       COUNT(job.id)::int AS total_job_count,
       COUNT(job.id) FILTER (
         WHERE job.status IN ('queued', 'processing')
           AND job.quota_day = (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow')::date
       )::int AS daily_reserved_count,
       COUNT(job.id) FILTER (WHERE job.status IN ('queued', 'processing'))::int AS project_reserved_count
     FROM omni_projects project
     LEFT JOIN omni_automation_jobs job ON job.project_id = project.id
     WHERE project.id = $1
       AND project.status <> 'archived'
     GROUP BY project.id`,
    [projectId]
  );
  if (!rows[0]) throw new Error("Omni client project not found");
  return { ...rows[0], automation_provider: normalizeOmniGenerationProvider(rows[0].automation_provider ?? process.env.OMNI_AUTOMATION_PROVIDER) };
}

export async function updateOmniAutomationSettings(input: {
  projectId: number;
  provider?: unknown;
  autoGenerateReels?: unknown;
  dailyReelLimit?: unknown;
  projectReelLimit?: unknown;
}) {
  if (input.provider !== undefined && !OMNI_GENERATION_PROVIDERS.includes(input.provider as OmniGenerationProvider)) {
    throw new Error("Unsupported generation provider");
  }
  await ensureOmniSchema();
  const current = await getOmniAutomationSettings(input.projectId);
  const nextAuto =
    typeof input.autoGenerateReels === "boolean" ? input.autoGenerateReels : current.auto_generate_reels;
  const dailyLimit = clampLimit(input.dailyReelLimit, current.daily_reel_limit || 3);
  const projectLimit = clampLimit(input.projectReelLimit, current.project_reel_limit || 30);
  const projectLimitReached = Number(current.project_job_count || 0) >= projectLimit;
  const turningOn = nextAuto && !current.auto_generate_reels && !projectLimitReached;
  const turningOff = !nextAuto && current.auto_generate_reels;
  const effectiveAuto = nextAuto && !projectLimitReached;

  await pool.query(
    `UPDATE omni_projects
     SET auto_generate_reels = $2,
         daily_reel_limit = $3,
         project_reel_limit = $4,
         automation_provider = COALESCE($8, automation_provider),
         automation_stopped_at = CASE
           WHEN $7 THEN CURRENT_TIMESTAMP
           WHEN $5 THEN NULL
           WHEN $6 THEN CURRENT_TIMESTAMP
           ELSE automation_stopped_at
         END,
         automation_stop_reason = CASE
           WHEN $7 THEN 'Достигнут лимит проекта'
           WHEN $5 THEN NULL
           WHEN $6 THEN 'Остановлено вручную'
           ELSE automation_stop_reason
         END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND status <> 'archived'`,
    [
      input.projectId,
      effectiveAuto,
      dailyLimit,
      projectLimit,
      turningOn,
      turningOff,
      projectLimitReached,
      input.provider ?? null,
    ]
  );

  return getOmniAutomationSettings(input.projectId);
}
