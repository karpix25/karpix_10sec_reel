import pool from "@/lib/db";
import { OmniProduct, OmniReferenceAsset } from "@/lib/omni/types";
import { ensureOmniSchema } from "./schema";

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRefs(value: unknown): OmniReferenceAsset[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): OmniReferenceAsset | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const candidate = item as Record<string, unknown>;
      const url = cleanText(candidate.url);
      if (!url) return null;
      const kind = candidate.kind === "image" || candidate.kind === "video" || candidate.kind === "note"
        ? candidate.kind
        : "image";
      return {
        id: cleanText(candidate.id) || url,
        url,
        kind,
        label: cleanText(candidate.label) || undefined,
      };
    })
    .filter((item): item is OmniReferenceAsset => Boolean(item));
}

export async function listOmniProducts(projectId: number) {
  await ensureOmniSchema();
  const { rows } = await pool.query<OmniProduct>(
    `SELECT *
     FROM omni_products
     WHERE project_id = $1
     ORDER BY updated_at DESC, id DESC`,
    [projectId]
  );
  return rows;
}

export async function createOmniProduct(input: {
  projectId: number;
  name: unknown;
  description?: unknown;
  productReferenceNotes?: unknown;
  avatarReferenceNotes?: unknown;
  targetDurationSeconds?: unknown;
  productRefs?: unknown;
  avatarRefs?: unknown;
}) {
  await ensureOmniSchema();
  const name = cleanText(input.name);
  if (!name) throw new Error("Product name is required");

  const duration = Number.parseInt(String(input.targetDurationSeconds || "30"), 10);
  const targetDuration = [30, 40].includes(duration) ? duration : 30;

  const { rows } = await pool.query<OmniProduct>(
    `INSERT INTO omni_products (
       project_id,
       name,
       description,
       product_reference_notes,
       avatar_reference_notes,
       target_duration_seconds,
       product_refs,
       avatar_refs,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, CURRENT_TIMESTAMP)
     RETURNING *`,
    [
      input.projectId,
      name,
      cleanText(input.description) || null,
      cleanText(input.productReferenceNotes) || null,
      cleanText(input.avatarReferenceNotes) || null,
      targetDuration,
      JSON.stringify(normalizeRefs(input.productRefs)),
      JSON.stringify(normalizeRefs(input.avatarRefs)),
    ]
  );

  return rows[0];
}

export async function getOmniProduct(productId: number) {
  await ensureOmniSchema();
  const { rows } = await pool.query<OmniProduct>("SELECT * FROM omni_products WHERE id = $1 LIMIT 1", [productId]);
  return rows[0] || null;
}
