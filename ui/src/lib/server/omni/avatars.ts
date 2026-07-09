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
     ORDER BY updated_at DESC, id DESC
     LIMIT 20`,
    [projectId]
  );
  return rows;
}

export async function createOmniClientAvatar(input: {
  projectId: number;
  prompt: unknown;
  referenceUrl?: unknown;
}) {
  await ensureOmniSchema();
  const prompt = cleanText(input.prompt);
  if (!prompt) throw new Error("Avatar prompt is required");

  const { rows } = await pool.query<OmniClientAvatar>(
    `INSERT INTO omni_client_avatars (
       project_id,
       prompt,
       reference_url,
       status,
       provider,
       updated_at
     )
     VALUES ($1, $2, $3, 'draft', 'kie_omni', CURRENT_TIMESTAMP)
     RETURNING *`,
    [input.projectId, prompt, cleanText(input.referenceUrl) || null]
  );

  return rows[0];
}
