import pool from "@/lib/db";
import { OmniProduct, OmniReferenceAsset } from "@/lib/omni/types";
import type { CtaMode } from "@/lib/omni/creative-contract";
import { analyzeProductReferenceImages } from "./openrouter-product-analysis-client";
import { ensureOmniSchema } from "./schema";

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

const CTA_MODES = new Set<CtaMode>([
  "article_in_description",
  "keyword_in_comments",
  "link_in_profile",
  "no_explicit_cta",
]);

function normalizeCtaMode(value: unknown): CtaMode {
  return CTA_MODES.has(value as CtaMode) ? value as CtaMode : "article_in_description";
}

function assertValidCta(mode: CtaMode, value: string) {
  if ((mode === "keyword_in_comments" || mode === "link_in_profile") && !value) {
    throw new Error("Selected CTA mode requires a value");
  }
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
      const role =
        candidate.role === "product_primary" ||
        candidate.role === "product_secondary" ||
        candidate.role === "avatar_reference" ||
        candidate.role === "continuity_reference"
          ? candidate.role
          : kind === "image"
            ? "product_primary"
            : undefined;
      const storageProvider =
        candidate.storage_provider === "s3" ||
        candidate.storage_provider === "external" ||
        candidate.storage_provider === "manual"
          ? candidate.storage_provider
          : "manual";
      const status =
        candidate.status === "ready" ||
        candidate.status === "uploading" ||
        candidate.status === "failed" ||
        candidate.status === "manual_url"
          ? candidate.status
          : "manual_url";
      return {
        id: cleanText(candidate.id) || url,
        url,
        kind,
        role,
        label: cleanText(candidate.label) || undefined,
        storage_provider: storageProvider,
        content_type: cleanText(candidate.content_type) || null,
        status,
        is_primary: typeof candidate.is_primary === "boolean" ? candidate.is_primary : role === "product_primary",
        created_at: cleanText(candidate.created_at) || new Date().toISOString(),
      };
    })
    .filter((item): item is OmniReferenceAsset => Boolean(item));
}

function normalizeRefsForUpdate(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }

  const refs = normalizeRefs(value);
  if (refs.length !== value.length) {
    throw new Error(`${fieldName} contains invalid refs`);
  }
  return refs;
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
  ctaMode?: unknown;
  ctaValue?: unknown;
}) {
  await ensureOmniSchema();
  const name = cleanText(input.name);
  if (!name) throw new Error("Product name is required");

  const duration = Number.parseInt(String(input.targetDurationSeconds || "30"), 10);
  const targetDuration = [30, 40].includes(duration) ? duration : 30;
  const ctaMode = normalizeCtaMode(input.ctaMode);
  const ctaValue = cleanText(input.ctaValue);
  assertValidCta(ctaMode, ctaValue);

  const { rows } = await pool.query<OmniProduct>(
    `INSERT INTO omni_products (
       project_id,
       name,
       description,
       product_reference_notes,
       avatar_reference_notes,
       target_duration_seconds,
       cta_mode,
       cta_value,
       product_refs,
       avatar_refs,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, CURRENT_TIMESTAMP)
     RETURNING *`,
    [
      input.projectId,
      name,
      cleanText(input.description) || null,
      cleanText(input.productReferenceNotes) || null,
      cleanText(input.avatarReferenceNotes) || null,
      targetDuration,
      ctaMode,
      ctaValue || null,
      JSON.stringify(normalizeRefs(input.productRefs)),
      JSON.stringify(normalizeRefs(input.avatarRefs)),
    ]
  );

  return rows[0];
}

export async function updateOmniProduct(input: {
  projectId: number;
  productId: number;
  name?: unknown;
  description?: unknown;
  productReferenceNotes?: unknown;
  avatarReferenceNotes?: unknown;
  productRefs?: unknown;
  avatarRefs?: unknown;
  ctaMode?: unknown;
  ctaValue?: unknown;
}) {
  await ensureOmniSchema();
  const current = await requireOmniProductInProject(input.projectId, input.productId);
  const hasName = input.name !== undefined;
  const hasDescription = input.description !== undefined;
  const hasProductReferenceNotes = input.productReferenceNotes !== undefined;
  const hasAvatarReferenceNotes = input.avatarReferenceNotes !== undefined;
  const hasProductRefs = input.productRefs !== undefined;
  const hasAvatarRefs = input.avatarRefs !== undefined;
  const hasCtaMode = input.ctaMode !== undefined;
  const hasCtaValue = input.ctaValue !== undefined;
  const nextName = hasName ? cleanText(input.name) : current.name;
  const nextCtaMode = hasCtaMode ? normalizeCtaMode(input.ctaMode) : current.cta_mode;
  const nextCtaValue = hasCtaValue ? cleanText(input.ctaValue) : current.cta_value || "";
  const nextDescription = hasDescription ? cleanText(input.description) || null : current.description;
  const nextProductReferenceNotes = hasProductReferenceNotes
    ? cleanText(input.productReferenceNotes) || null
    : current.product_reference_notes;
  const nextProductRefs = hasProductRefs
    ? normalizeRefsForUpdate(input.productRefs, "productRefs")
    : current.product_refs;
  const nextAvatarRefs = hasAvatarRefs
    ? normalizeRefsForUpdate(input.avatarRefs, "avatarRefs")
    : current.avatar_refs;
  const visualInputChanged =
    nextDescription !== current.description ||
    nextProductReferenceNotes !== current.product_reference_notes ||
    JSON.stringify(nextProductRefs) !== JSON.stringify(current.product_refs);
  if (!nextName) throw new Error("Product name is required");
  assertValidCta(nextCtaMode, nextCtaValue);

  const { rows } = await pool.query<OmniProduct>(
    `UPDATE omni_products
     SET name = $3,
         description = $4,
         product_reference_notes = $5,
         avatar_reference_notes = $6,
         cta_mode = $7,
         cta_value = $8,
         product_refs = $9::jsonb,
         avatar_refs = $10::jsonb,
         product_visual_profile = CASE WHEN $11 THEN NULL ELSE product_visual_profile END,
         product_visual_profile_status = CASE WHEN $11 THEN 'missing' ELSE product_visual_profile_status END,
         product_visual_profile_model = CASE WHEN $11 THEN NULL ELSE product_visual_profile_model END,
         product_visual_profile_error = CASE WHEN $11 THEN NULL ELSE product_visual_profile_error END,
         product_visual_profile_updated_at = CASE WHEN $11 THEN NULL ELSE product_visual_profile_updated_at END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND project_id = $2
     RETURNING *`,
    [
      input.productId,
      input.projectId,
      nextName,
      nextDescription,
      nextProductReferenceNotes,
      hasAvatarReferenceNotes ? cleanText(input.avatarReferenceNotes) || null : current.avatar_reference_notes,
      nextCtaMode,
      nextCtaValue || null,
      JSON.stringify(nextProductRefs),
      JSON.stringify(nextAvatarRefs),
      visualInputChanged,
    ]
  );

  if (!rows[0]) {
    throw new Error("Product does not belong to this Omni client project");
  }
  return rows[0];
}

export async function deleteOmniProduct(input: { projectId: number; productId: number }) {
  await ensureOmniSchema();
  const { rows } = await pool.query<OmniProduct>(
    `DELETE FROM omni_products
     WHERE id = $1 AND project_id = $2
     RETURNING *`,
    [input.productId, input.projectId]
  );

  if (!rows[0]) {
    throw new Error("Product does not belong to this Omni client project");
  }
  return rows[0];
}

export async function analyzeOmniProductReference(input: { projectId: number; productId: number }) {
  await ensureOmniSchema();
  const product = await requireOmniProductInProject(input.projectId, input.productId);
  const imageRefs = product.product_refs
    .filter((ref) => ref.kind === "image" && ref.status !== "failed")
    .map((ref) => ({ ...ref, url: resolvePublicReferenceUrl(ref.url) }))
    .filter((ref) => Boolean(ref.url));

  if (!imageRefs.length) {
    throw new Error("Product needs at least one ready image reference for analysis");
  }

  await pool.query(
    `UPDATE omni_products
     SET product_visual_profile_status = 'processing',
         product_visual_profile_error = NULL,
         product_visual_profile_updated_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND project_id = $2`,
    [input.productId, input.projectId]
  );

  try {
    const analysis = await analyzeProductReferenceImages({
      productName: product.name,
      productDescription: product.description,
      productReferenceNotes: product.product_reference_notes,
      references: imageRefs,
    });
    const { rows } = await pool.query<OmniProduct>(
      `UPDATE omni_products
       SET product_visual_profile = $3::jsonb,
           product_visual_profile_status = 'completed',
           product_visual_profile_model = $4,
           product_visual_profile_error = NULL,
           product_visual_profile_updated_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND project_id = $2
       RETURNING *`,
      [input.productId, input.projectId, JSON.stringify(analysis.profile), analysis.model]
    );
    return rows[0];
  } catch (error) {
    const message = error instanceof Error ? error.message : "Product reference analysis failed";
    await pool.query(
      `UPDATE omni_products
       SET product_visual_profile_status = 'failed',
           product_visual_profile_error = $3,
           product_visual_profile_updated_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND project_id = $2`,
      [input.productId, input.projectId, message.slice(0, 800)]
    );
    throw error;
  }
}

export async function getOmniProduct(productId: number) {
  await ensureOmniSchema();
  const { rows } = await pool.query<OmniProduct>("SELECT * FROM omni_products WHERE id = $1 LIMIT 1", [productId]);
  return rows[0] || null;
}

export async function requireOmniProductInProject(projectId: number, productId: number) {
  await ensureOmniSchema();
  const { rows } = await pool.query<OmniProduct>(
    "SELECT * FROM omni_products WHERE id = $1 AND project_id = $2 LIMIT 1",
    [productId, projectId]
  );
  if (!rows[0]) {
    throw new Error("Product does not belong to this Omni client project");
  }
  return rows[0];
}

function resolvePublicReferenceUrl(url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  const appUrl = cleanText(process.env.NEXT_PUBLIC_APP_URL);
  if (!appUrl || !url.startsWith("/")) return url;
  return `${appUrl.replace(/\/+$/u, "")}${url}`;
}
