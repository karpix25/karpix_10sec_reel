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
  targetAudience?: unknown;
  brandVoice?: unknown;
}) {
  await ensureOmniSchema();

  const { rows } = await pool.query<ProjectRow>(
    `UPDATE omni_projects
     SET target_audience = $2,
         brand_voice = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status <> 'archived'
     RETURNING *`,
    [
      input.projectId,
      normalizeText(input.targetAudience) || null,
      normalizeText(input.brandVoice) || null,
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
