import pool from "@/lib/db";
import { normalizeDirectorBrief, type DirectorBrief, type OmniDirectorAnalysis } from "./director-analysis-types";

/**
 * Reference materials ("конспекты") are the persistent, product-agnostic
 * knowledge layer derived from director analyses of reference reels.
 * The brief is already extracted by the analysis pipeline; this module
 * projects it into a queryable library so the scriptwriter and director
 * roles can consume accumulated reference knowledge instead of one
 * single original per script.
 */

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS omni_reference_materials (
    id SERIAL PRIMARY KEY,
    analysis_id BIGINT NOT NULL,
    project_id INTEGER REFERENCES omni_projects(id) ON DELETE SET NULL,
    product_id INTEGER REFERENCES omni_products(id) ON DELETE SET NULL,
    format_mode TEXT,
    render_mode TEXT,
    motion_mode TEXT,
    product_position TEXT,
    topic TEXT,
    core_concept TEXT,
    hook_mechanism TEXT,
    visual_hook_action TEXT,
    retention_trigger TEXT,
    narrative_structure JSONB NOT NULL DEFAULT '[]'::jsonb,
    duration_seconds INTEGER,
    source_reels_url TEXT,
    source_title TEXT,
    material_json JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(analysis_id)
  )`,
  `CREATE TABLE IF NOT EXISTS omni_product_reference_library (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES omni_products(id) ON DELETE CASCADE,
    material_id INTEGER NOT NULL REFERENCES omni_reference_materials(id) ON DELETE CASCADE,
    note TEXT,
    added_by TEXT NOT NULL DEFAULT 'auto',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, material_id)
  )`,
  "CREATE INDEX IF NOT EXISTS idx_omni_reference_materials_project ON omni_reference_materials(project_id)",
  "CREATE INDEX IF NOT EXISTS idx_omni_reference_materials_format ON omni_reference_materials(format_mode)",
  "CREATE INDEX IF NOT EXISTS idx_omni_product_reference_library_product ON omni_product_reference_library(product_id, created_at DESC)",
];

let materialsSchemaReady: Promise<void> | null = null;

export async function ensureReferenceMaterialsSchema() {
  if (!materialsSchemaReady) {
    materialsSchemaReady = (async () => {
      for (const statement of SCHEMA_STATEMENTS) {
        await pool.query(statement);
      }
    })().catch((error) => {
      materialsSchemaReady = null;
      throw error;
    });
  }
  return materialsSchemaReady;
}

export type OmniReferenceMaterialDigest = {
  format_mode: string | null;
  render_mode: string | null;
  motion_mode: string | null;
  product_position: string | null;
  topic: string | null;
  core_concept: string | null;
  hook_mechanism: string | null;
  visual_hook_action: string | null;
  retention_trigger: string | null;
  narrative_structure: string[];
  duration_seconds: number | null;
  source_reels_url: string | null;
  source_title: string | null;
  material_json: Record<string, unknown>;
};

type AnalysisLike = {
  director_analysis_json?: unknown;
  source_snapshot?: {
    title?: unknown;
    topic?: unknown;
    reels_url?: unknown;
    duration_seconds?: unknown;
  } | null;
  original_reels_url?: string | null;
};

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function durationOrNull(value: unknown): number | null {
  const duration = Number(value);
  return Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null;
}

/** Pure projection of a completed director analysis into a material digest. */
export function deriveReferenceMaterialDigest(analysis: AnalysisLike): OmniReferenceMaterialDigest | null {
  const brief: DirectorBrief | null = normalizeDirectorBrief(analysis.director_analysis_json ?? null);
  if (!brief) return null;

  const meaning = brief.content_meaning;
  const snapshot = analysis.source_snapshot || {};
  const materialJson: Record<string, unknown> = {
    atmosphere: brief.atmosphere ?? null,
    montage_rhythm: brief.montage_rhythm ?? null,
    camera: brief.camera ?? null,
    camera_timeline: brief.camera_timeline ?? null,
    location_timeline: brief.location_timeline ?? null,
    action_beats: brief.action_beats ?? null,
    reusable_mechanics: brief.reusable_mechanics ?? null,
    hand_object_interactions: brief.hand_object_interactions ?? null,
    motion_continuity: brief.motion_continuity ?? null,
    reference_action_style: brief.reference_action_style ?? null,
    audio_profile: brief.audio_profile ?? null,
    product_introduction: brief.product_introduction ?? null,
    visual_transfer: brief.visual_transfer ?? null,
    problem_or_question: meaning?.problem_or_question ?? null,
    key_arguments: meaning?.key_arguments ?? null,
    proof_or_examples: meaning?.proof_or_examples ?? null,
    cta_mechanism: meaning?.cta_mechanism ?? null,
    conclusion: meaning?.conclusion ?? null,
  };

  return {
    format_mode: stringOrNull(brief.reference_format_mode),
    render_mode: stringOrNull(brief.reference_render_mode),
    motion_mode: stringOrNull(brief.reference_motion_mode),
    product_position: stringOrNull(brief.product_introduction?.relative_position),
    topic: stringOrNull(meaning?.topic) || stringOrNull(snapshot.topic),
    core_concept: stringOrNull(meaning?.core_concept),
    hook_mechanism: stringOrNull(meaning?.hook_mechanism),
    visual_hook_action: stringOrNull(brief.visual_hook?.action),
    retention_trigger: stringOrNull(brief.visual_hook?.retention_trigger),
    narrative_structure: Array.isArray(meaning?.narrative_structure)
      ? meaning.narrative_structure.filter((step): step is string => typeof step === "string" && step.trim().length > 0)
      : [],
    duration_seconds: durationOrNull(snapshot.duration_seconds),
    source_reels_url: stringOrNull(snapshot.reels_url) || stringOrNull(analysis.original_reels_url),
    source_title: stringOrNull(snapshot.title),
    material_json: materialJson,
  };
}

export async function upsertReferenceMaterialForAnalysis(analysis: OmniDirectorAnalysis) {
  if (analysis.director_analysis_status !== "completed") return;
  const digest = deriveReferenceMaterialDigest(analysis);
  if (!digest) return;

  await ensureReferenceMaterialsSchema();
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO omni_reference_materials (
       analysis_id, project_id, product_id,
       format_mode, render_mode, motion_mode, product_position,
       topic, core_concept, hook_mechanism, visual_hook_action, retention_trigger,
       narrative_structure, duration_seconds, source_reels_url, source_title, material_json,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15, $16, $17::jsonb, CURRENT_TIMESTAMP)
     ON CONFLICT (analysis_id) DO UPDATE SET
       project_id = EXCLUDED.project_id,
       product_id = EXCLUDED.product_id,
       format_mode = EXCLUDED.format_mode,
       render_mode = EXCLUDED.render_mode,
       motion_mode = EXCLUDED.motion_mode,
       product_position = EXCLUDED.product_position,
       topic = EXCLUDED.topic,
       core_concept = EXCLUDED.core_concept,
       hook_mechanism = EXCLUDED.hook_mechanism,
       visual_hook_action = EXCLUDED.visual_hook_action,
       retention_trigger = EXCLUDED.retention_trigger,
       narrative_structure = EXCLUDED.narrative_structure,
       duration_seconds = EXCLUDED.duration_seconds,
       source_reels_url = EXCLUDED.source_reels_url,
       source_title = EXCLUDED.source_title,
       material_json = EXCLUDED.material_json,
       updated_at = CURRENT_TIMESTAMP
     RETURNING id`,
    [
      analysis.id,
      analysis.project_id,
      analysis.product_id,
      digest.format_mode,
      digest.render_mode,
      digest.motion_mode,
      digest.product_position,
      digest.topic,
      digest.core_concept,
      digest.hook_mechanism,
      digest.visual_hook_action,
      digest.retention_trigger,
      JSON.stringify(digest.narrative_structure),
      digest.duration_seconds,
      digest.source_reels_url,
      digest.source_title,
      JSON.stringify(digest.material_json),
    ]
  );
  const materialId = rows[0]?.id;
  if (materialId && analysis.product_id) {
    await addReferenceMaterialToProductLibrary({
      productId: analysis.product_id,
      materialId,
      addedBy: "auto",
    });
  }
}

export async function backfillReferenceMaterials(limit = 200) {
  await ensureReferenceMaterialsSchema();
  const { rows } = await pool.query<{ id: number }>(
    `SELECT a.id
     FROM omni_legacy_video_analyses a
     LEFT JOIN omni_reference_materials m ON m.analysis_id = a.id
     WHERE a.director_analysis_status = 'completed'
       AND a.director_analysis_json IS NOT NULL
       AND m.id IS NULL
     ORDER BY a.completed_at DESC NULLS LAST
     LIMIT $1`,
    [limit]
  );

  let created = 0;
  for (const row of rows) {
    const analysis = await pool.query<Record<string, unknown>>(
      "SELECT * FROM omni_legacy_video_analyses WHERE id = $1",
      [row.id]
    );
    const record = analysis.rows[0];
    if (!record) continue;
    const before = await countMaterials();
    await upsertReferenceMaterialForAnalysis(normalizeMaterialAnalysis(record));
    if (await countMaterials() > before) created += 1;
  }
  return { processed: rows.length, created, total: await countMaterials() };
}

async function countMaterials() {
  const { rows } = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM omni_reference_materials");
  return Number(rows[0]?.count || 0);
}

function normalizeMaterialAnalysis(record: Record<string, unknown>): OmniDirectorAnalysis {
  return record as unknown as OmniDirectorAnalysis;
}

export type OmniProductReferenceLibraryItem = {
  library_entry_id: number;
  material_id: number;
  note: string | null;
  added_by: string;
  format_mode: string | null;
  product_position: string | null;
  topic: string | null;
  core_concept: string | null;
  hook_mechanism: string | null;
  visual_hook_action: string | null;
  retention_trigger: string | null;
  narrative_structure: string[];
  duration_seconds: number | null;
  source_reels_url: string | null;
  source_title: string | null;
  material_json: Record<string, unknown> | null;
};

export async function listProductReferenceMaterials(productId: number, limit = 50): Promise<OmniProductReferenceLibraryItem[]> {
  await ensureReferenceMaterialsSchema();
  const { rows } = await pool.query(
    `SELECT l.id AS library_entry_id, l.note, l.added_by,
            m.id AS material_id, m.format_mode, m.product_position, m.topic, m.core_concept,
            m.hook_mechanism, m.visual_hook_action, m.retention_trigger, m.narrative_structure,
            m.duration_seconds, m.source_reels_url, m.source_title, m.material_json
     FROM omni_product_reference_library l
     JOIN omni_reference_materials m ON m.id = l.material_id
     WHERE l.product_id = $1
     ORDER BY l.created_at DESC
     LIMIT $2`,
    [productId, limit]
  );
  return rows.map((row: Record<string, unknown>) => ({
    library_entry_id: Number(row.library_entry_id),
    material_id: Number(row.material_id),
    note: stringOrNull(row.note),
    added_by: stringOrNull(row.added_by) || "auto",
    format_mode: stringOrNull(row.format_mode),
    product_position: stringOrNull(row.product_position),
    topic: stringOrNull(row.topic),
    core_concept: stringOrNull(row.core_concept),
    hook_mechanism: stringOrNull(row.hook_mechanism),
    visual_hook_action: stringOrNull(row.visual_hook_action),
    retention_trigger: stringOrNull(row.retention_trigger),
    narrative_structure: Array.isArray(row.narrative_structure) ? row.narrative_structure : [],
    duration_seconds: row.duration_seconds === null || row.duration_seconds === undefined ? null : Number(row.duration_seconds),
    source_reels_url: stringOrNull(row.source_reels_url),
    source_title: stringOrNull(row.source_title),
    material_json: (row.material_json && typeof row.material_json === "object")
      ? row.material_json as Record<string, unknown>
      : null,
  }));
}

export async function addReferenceMaterialToProductLibrary(input: {
  productId: number;
  materialId: number;
  note?: string | null;
  addedBy?: string;
}) {
  await ensureReferenceMaterialsSchema();
  await pool.query(
    `INSERT INTO omni_product_reference_library (product_id, material_id, note, added_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (product_id, material_id) DO UPDATE SET
       note = COALESCE(EXCLUDED.note, omni_product_reference_library.note)`,
    [input.productId, input.materialId, input.note ?? null, input.addedBy || "user"]
  );
}

export async function removeReferenceMaterialFromProductLibrary(productId: number, materialId: number) {
  await ensureReferenceMaterialsSchema();
  await pool.query(
    "DELETE FROM omni_product_reference_library WHERE product_id = $1 AND material_id = $2",
    [productId, materialId]
  );
}

export async function listAvailableReferenceMaterials(limit = 100) {
  await ensureReferenceMaterialsSchema();
  const { rows } = await pool.query(
    `SELECT id, topic, core_concept, format_mode, product_position, hook_mechanism,
            duration_seconds, source_reels_url, source_title
     FROM omni_reference_materials
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows.map((row: Record<string, unknown>) => ({
    id: Number(row.id),
    topic: stringOrNull(row.topic),
    core_concept: stringOrNull(row.core_concept),
    format_mode: stringOrNull(row.format_mode),
    product_position: stringOrNull(row.product_position),
    hook_mechanism: stringOrNull(row.hook_mechanism),
    duration_seconds: row.duration_seconds === null || row.duration_seconds === undefined ? null : Number(row.duration_seconds),
    source_reels_url: stringOrNull(row.source_reels_url),
    source_title: stringOrNull(row.source_title),
  }));
}
