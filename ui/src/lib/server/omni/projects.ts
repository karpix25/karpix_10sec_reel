import pool from "@/lib/db";
import { OmniProject } from "@/lib/omni/types";
import { ensureOmniSchema } from "./schema";

type ProjectRow = OmniProject;

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function listOmniProjects() {
  await ensureOmniSchema();
  const { rows } = await pool.query<ProjectRow>(
    `SELECT *
     FROM omni_projects
     WHERE status <> 'archived'
     ORDER BY updated_at DESC, id DESC`
  );
  return rows;
}

export async function createOmniProject(input: {
  name: unknown;
  description?: unknown;
  targetAudience?: unknown;
  brandVoice?: unknown;
  legacyClientId?: unknown;
  telegramChatId?: unknown;
  telegramTopicId?: unknown;
  createdByTelegramId?: number;
}) {
  await ensureOmniSchema();

  const name = normalizeText(input.name);
  if (!name) {
    throw new Error("Project name is required");
  }

  const { rows } = await pool.query<ProjectRow>(
    `INSERT INTO omni_projects (
       name,
       description,
       target_audience,
       brand_voice,
       legacy_client_id,
       telegram_chat_id,
       telegram_topic_id,
       created_by_telegram_id,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
     RETURNING *`,
    [
      name,
      normalizeText(input.description) || null,
      normalizeText(input.targetAudience) || null,
      normalizeText(input.brandVoice) || null,
      Number.parseInt(String(input.legacyClientId || ""), 10) || null,
      normalizeText(input.telegramChatId) || null,
      normalizeText(input.telegramTopicId) || null,
      input.createdByTelegramId || null,
    ]
  );

  return rows[0];
}

export async function updateOmniProjectProfile(input: {
  projectId: number;
  name?: unknown;
  targetAudience?: unknown;
  brandVoice?: unknown;
}) {
  await ensureOmniSchema();
  const current = await getOmniProject(input.projectId);
  if (!current || current.status === "archived") {
    throw new Error("Omni client project not found");
  }

  const hasName = input.name !== undefined;
  const hasTargetAudience = input.targetAudience !== undefined;
  const hasBrandVoice = input.brandVoice !== undefined;
  const nextName = hasName ? normalizeText(input.name) : current.name;
  if (!nextName) {
    throw new Error("Project name is required");
  }

  const { rows } = await pool.query<ProjectRow>(
    `UPDATE omni_projects
     SET name = $2,
         target_audience = $3,
         brand_voice = $4,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status <> 'archived'
     RETURNING *`,
    [
      input.projectId,
      nextName,
      hasTargetAudience ? normalizeText(input.targetAudience) || null : current.target_audience,
      hasBrandVoice ? normalizeText(input.brandVoice) || null : current.brand_voice,
    ]
  );

  if (!rows[0]) {
    throw new Error("Omni client project not found");
  }

  return rows[0];
}

export async function getOmniProject(projectId: number) {
  await ensureOmniSchema();
  const { rows } = await pool.query<ProjectRow>("SELECT * FROM omni_projects WHERE id = $1 LIMIT 1", [projectId]);
  return rows[0] || null;
}
