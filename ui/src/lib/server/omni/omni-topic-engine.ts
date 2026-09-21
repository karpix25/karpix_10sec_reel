import pool from "@/lib/db";
import { ensureOmniSchema } from "./schema";
import { ensureReferenceMaterialsSchema, listProductReferenceMaterials } from "./omni-reference-materials";
import { isConceptCoveredByScripts, suggestFrameId, type ExistingScriptLike } from "./omni-topic-proposer";
import { collectScriptwriterFrames, type ScriptwriterFrame } from "./omni-scriptwriter-frames";
import { getCachedTopicAxes } from "./omni-product-topic-axes";
import { buildMatrixCells, matrixUsageFromRows, pickMatrixProposals } from "./omni-topic-matrix";
import type { ScriptwriterMatrixCell } from "./omni-scriptwriter";

/**
 * Two-layer topic engine.
 * Layer "proven": topics taken from viral reference materials (real view
 * counts) — the strongest signal we have, so it outranks everything else.
 * Layer "matrix": the combinatorial benefit x audience x frame cells that
 * scale with the product card. Proven always sorts first.
 */

const PROVEN_MIN_VIEWS = 10_000;
const DEFAULT_PROPOSAL_LIMIT = 5;

export type TopicEngineProposal = {
  topic: string;
  layer: "proven" | "matrix";
  evidence: string;
  frameId: string | null;
  materialIds: number[];
  matrixCell: ScriptwriterMatrixCell | null;
  score: number;
};

export type ProvenMaterialInput = {
  material_id: number;
  topic: string | null;
  core_concept: string | null;
  conclusion: string | null;
  views: number | null;
  narrative_structure: string[];
};

export type ProvenCandidate = {
  materialId: number;
  topic: string;
  concept: string;
  views: number;
  frameId: string | null;
};

/**
 * Pure proven-layer ranking: viral materials only (>=10k views), dedup by
 * concept, sorted by views descending. Topic text follows the proposer's
 * fallback chain: conclusion first, then core concept, then snapshot topic.
 */
export function rankProvenMaterials(materials: ProvenMaterialInput[], frames: ScriptwriterFrame[] = []): ProvenCandidate[] {
  const byConcept = new Map<string, ProvenCandidate>();
  const sorted = [...materials].sort((left, right) => (right.views || 0) - (left.views || 0));
  for (const material of sorted) {
    if (!material.views || material.views < PROVEN_MIN_VIEWS) continue;
    // Proposer fallback chain: conclusion anchors the topic text, while the
    // dedup/coverage concept falls back through core_concept -> snapshot topic
    // -> conclusion so conclusion-only old analyses still qualify.
    const concept = (material.core_concept || material.topic || material.conclusion || "").trim();
    if (concept.length < 8) continue;
    const topicText = (material.conclusion || concept).trim().slice(0, 160);
    if (!topicText) continue;
    const signature = concept.toLowerCase().replace(/\s+/g, " ").trim();
    if (byConcept.has(signature)) continue;
    byConcept.set(signature, {
      materialId: material.material_id,
      topic: topicText,
      concept,
      views: material.views,
      frameId: suggestFrameId(
        { ...material, hook_mechanism: null, visual_hook_action: null, format_mode: null, product_position: null },
        frames.length ? frames : collectScriptwriterFrames([])
      ),
    });
  }
  return [...byConcept.values()].sort((left, right) => right.views - left.views);
}

/** Existing script texts for the product, used to skip already-covered topics. */
async function loadExistingScripts(productId: number): Promise<ExistingScriptLike[]> {
  const { rows } = await pool.query<{ script: string; title: string | null; hook: string | null }>(
    `SELECT script, title, hook
     FROM omni_generated_scripts
     WHERE product_id = $1
     ORDER BY created_at DESC
     LIMIT 500`,
    [productId]
  );
  return rows.filter((row) => typeof row.script === "string" && row.script.trim());
}

async function loadProvenProposals(productId: number, limit: number): Promise<TopicEngineProposal[]> {
  const library = await listProductReferenceMaterials(productId, 500);
  const materials: ProvenMaterialInput[] = library.map((item) => ({
    material_id: item.material_id,
    topic: item.topic,
    core_concept: item.core_concept,
    conclusion: typeof item.material_json?.conclusion === "string" ? item.material_json.conclusion : null,
    views: item.views,
    narrative_structure: item.narrative_structure,
  }));
  const existingScripts = await loadExistingScripts(productId);
  return rankProvenMaterials(materials, collectScriptwriterFrames(library))
    .filter((candidate) => !isConceptCoveredByScripts(candidate.concept, existingScripts))
    .slice(0, limit)
    .map((candidate) => ({
      topic: candidate.topic,
      layer: "proven" as const,
      evidence: `${candidate.views} просмотров референса`,
      frameId: candidate.frameId,
      materialIds: [candidate.materialId],
      matrixCell: null,
      score: 1000 + candidate.views,
    }));
}

/** Matrix layer; any failure (missing axes, query error) yields an empty list. */
async function loadMatrixProposals(productId: number, limit: number): Promise<TopicEngineProposal[]> {
  try {
    const cached = await getCachedTopicAxes(productId);
    if (!cached) return [];
    const library = await listProductReferenceMaterials(productId, 500);
    const cells = buildMatrixCells(cached.axes, collectScriptwriterFrames(library));
    const { rows } = await pool.query<{ matrix_cell: unknown; created_at: string }>(
      `SELECT source_snapshot->'matrix_cell' AS matrix_cell, created_at
       FROM omni_generated_scripts
       WHERE product_id = $1 AND source_snapshot->'matrix_cell'->>'signature' IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 2000`,
      [productId]
    );
    return pickMatrixProposals({ cells, usage: matrixUsageFromRows(rows), limit }).map((cell, index) => ({
      topic: cell.topic,
      layer: "matrix" as const,
      evidence: `матрица: ${cell.benefitTitle} × ${cell.audienceTitle}`,
      frameId: cell.frameId,
      materialIds: [],
      matrixCell: {
        signature: cell.signature,
        benefit: cell.benefitTitle,
        audience: cell.audienceTitle,
        frameId: cell.frameId,
      },
      score: 100 + index,
    }));
  } catch (error) {
    console.warn("Omni topic engine matrix layer unavailable:", error instanceof Error ? error.message : String(error));
    return [];
  }
}

export async function pickNextTopicsForProduct(input: {
  projectId: number;
  productId: number;
  limit?: number;
}): Promise<TopicEngineProposal[]> {
  const limit = Math.max(1, input.limit || DEFAULT_PROPOSAL_LIMIT);
  await ensureOmniSchema();
  await ensureReferenceMaterialsSchema();

  const proven = await loadProvenProposals(input.productId, limit);
  const matrix = await loadMatrixProposals(input.productId, limit);
  return [...proven, ...matrix].slice(0, limit);
}
