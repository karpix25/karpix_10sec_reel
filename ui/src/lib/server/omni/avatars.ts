import pool from "@/lib/db";
import { OmniClientAvatar } from "@/lib/omni/types";
import { ensureOmniSchema } from "./schema";

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function listOmniClientAvatars(projectId: number) {
  await ensureOmniSchema();
  const { rows } = await pool.query<OmniClientAvatar>(
    `SELECT *
     FROM omni_client_avatars
     WHERE project_id = $1
     ORDER BY is_active DESC, updated_at DESC, id DESC
     LIMIT 20`,
    [projectId]
  );
  return rows;
}

export async function getLatestOmniClientAvatar(projectId: number) {
  await ensureOmniSchema();
  const { rows } = await pool.query<OmniClientAvatar>(
    `SELECT *
     FROM omni_client_avatars
     WHERE project_id = $1
       AND is_active = TRUE
       AND reference_url IS NOT NULL
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
    [projectId]
  );
  return rows[0] || null;
}

export async function createOmniClientAvatar(input: {
  projectId: number;
  displayName?: unknown;
  prompt: unknown;
  referenceUrl?: unknown;
  status?: unknown;
  provider?: unknown;
}) {
  await ensureOmniSchema();
  const prompt = cleanText(input.prompt);
  if (!prompt) throw new Error("Avatar prompt is required");
  const displayName = cleanText(input.displayName);
  const status = cleanText(input.status) || "draft";
  const provider = cleanText(input.provider) || "gpt-image-2";

  const { rows } = await pool.query<OmniClientAvatar>(
    `INSERT INTO omni_client_avatars (
       project_id,
       display_name,
       prompt,
       reference_url,
       status,
       provider,
       is_active,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, TRUE, CURRENT_TIMESTAMP)
     RETURNING *`,
    [input.projectId, displayName || null, prompt, cleanText(input.referenceUrl) || null, status, provider]
  );

  return rows[0];
}

export async function updateOmniClientAvatarStatus(input: {
  projectId: number;
  avatarId: number;
  status: unknown;
}) {
  await ensureOmniSchema();
  const status = cleanText(input.status);
  if (!status) throw new Error("Avatar status is required");

  const { rows } = await pool.query<OmniClientAvatar>(
    `UPDATE omni_client_avatars
     SET status = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND project_id = $2
     RETURNING *`,
    [input.avatarId, input.projectId, status]
  );

  if (!rows[0]) throw new Error("Avatar was not found");
  return rows[0];
}

export async function updateOmniClientAvatarActive(input: {
  projectId: number;
  avatarId: number;
  isActive: unknown;
}) {
  await ensureOmniSchema();
  const isActive = Boolean(input.isActive);

  const { rows } = await pool.query<OmniClientAvatar>(
    `UPDATE omni_client_avatars
     SET is_active = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND project_id = $2
     RETURNING *`,
    [input.avatarId, input.projectId, isActive]
  );

  if (!rows[0]) throw new Error("Avatar was not found");
  return rows[0];
}

export async function updateOmniClientAvatarName(input: {
  projectId: number;
  avatarId: number;
  displayName: unknown;
}) {
  await ensureOmniSchema();
  const displayName = cleanText(input.displayName);

  const { rows } = await pool.query<OmniClientAvatar>(
    `UPDATE omni_client_avatars
     SET display_name = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND project_id = $2
     RETURNING *`,
    [input.avatarId, input.projectId, displayName || null]
  );

  if (!rows[0]) throw new Error("Avatar was not found");
  return rows[0];
}

export async function deleteOmniClientAvatar(input: { projectId: number; avatarId: number }) {
  await ensureOmniSchema();
  const { rowCount } = await pool.query(
    `DELETE FROM omni_client_avatars
     WHERE id = $1
       AND project_id = $2`,
    [input.avatarId, input.projectId]
  );
  if (!rowCount) throw new Error("Avatar was not found");
}
