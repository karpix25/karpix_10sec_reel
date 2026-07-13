import pool from "@/lib/db";
import type { OmniGeneratedScript, OmniPromptPreviewSegment } from "@/lib/omni/types";
import { ensureOmniSchema } from "./schema";
import { getLatestOmniClientAvatar } from "./avatars";
import { getRandomLegacyScenarioFromClients } from "./legacy-scenarios";
import { listLegacyLibraryLinks } from "./legacy-library-links";
import { buildOmniSegmentPrompts } from "./omni-prompt-builder";
import { requireOmniProductInProject } from "./products";
import { getOmniProject } from "./projects";
import { listRecentLifeFormatIds } from "./omni-creative-history";
import { OMNI_SEGMENT_SECONDS, planOmniReelSegments } from "./omni-duration-planner";
import { ensureOmniScriptCta } from "./omni-cta-contract";
import { generateScript } from "./script-generator";

function normalizeScript(row: OmniGeneratedScript): OmniGeneratedScript {
  return {
    ...row,
    source_legacy_scenario_id:
      row.source_legacy_scenario_id === null ? null : Number(row.source_legacy_scenario_id),
    source_legacy_client_id:
      row.source_legacy_client_id === null ? null : Number(row.source_legacy_client_id),
  };
}

export async function listGeneratedScripts(projectId: number, productId?: number | null) {
  await ensureOmniSchema();
  const values: unknown[] = [projectId];
  const clauses = ["project_id = $1"];

  if (productId) {
    values.push(productId);
    clauses.push(`product_id = $${values.length}`);
  }

  const { rows } = await pool.query<OmniGeneratedScript>(
    `SELECT *
     FROM omni_generated_scripts
     WHERE ${clauses.join(" AND ")}
     ORDER BY created_at DESC, id DESC
     LIMIT 50`,
    values
  );
  return rows.map(normalizeScript);
}

export async function getGeneratedScript(input: { projectId: number; productId: number; scriptId: number }) {
  await ensureOmniSchema();
  const { rows } = await pool.query<OmniGeneratedScript>(
    `SELECT *
     FROM omni_generated_scripts
     WHERE id = $1
       AND project_id = $2
       AND product_id = $3
       AND status <> 'archived'
     LIMIT 1`,
    [input.scriptId, input.projectId, input.productId]
  );
  return rows[0] ? normalizeScript(rows[0]) : null;
}

export async function buildGeneratedScriptPromptPreview(input: {
  projectId: number;
  productId: number;
  scriptId: number;
}): Promise<OmniPromptPreviewSegment[]> {
  const generatedScript = await getGeneratedScript(input);
  if (!generatedScript) throw new Error("Generated script not found for this product");

  const product = await requireOmniProductInProject(input.projectId, input.productId);
  const resolvedGeneratedScript = {
    ...generatedScript,
    script: ensureOmniScriptCta(generatedScript.script, product.cta_mode, product.cta_value),
  };
  const avatar = await getLatestOmniClientAvatar(input.projectId);
  const project = await getOmniProject(input.projectId);
  if (!project) throw new Error("Omni client project not found");
  const segmentPlan = planOmniReelSegments(resolvedGeneratedScript.script);
  const recentFormatIds = await listRecentLifeFormatIds(input.projectId, input.productId);

  return buildOmniSegmentPrompts({
    generatedScript: resolvedGeneratedScript,
    legacyTranscript: null,
    product,
    avatar,
    segmentCount: segmentPlan.segmentCount,
    segmentSeconds: OMNI_SEGMENT_SECONDS,
    brief: null,
    targetAudience: project.target_audience,
    ctaMode: product.cta_mode,
    ctaValue: product.cta_value,
    recentFormatIds,
  }).map((segment) => ({
    segmentIndex: segment.index,
    durationSeconds: OMNI_SEGMENT_SECONDS,
    role: segment.role,
    prompt: segment.prompt,
    referenceUrl: segment.referenceUrl,
    voiceoverText: segment.voiceoverText,
    creativeStrategy: segment.creativeStrategy,
    creativePlan: segment.creativePlan,
    validation: segment.validation,
  }));
}

export async function createGeneratedScriptFromLegacy(input: {
  projectId: number;
  productId: number;
}) {
  await ensureOmniSchema();
  const project = await getOmniProject(input.projectId);
  if (!project) throw new Error("Omni client project not found");

  const product = await requireOmniProductInProject(input.projectId, input.productId);
  const libraryLinks = await listLegacyLibraryLinks(input.projectId, null);
  const legacyClientIds = libraryLinks.map((link) => link.legacy_client_id);
  if (!legacyClientIds.length) {
    throw new Error("No active legacy bundles for this project");
  }

  const sourceScenario = await getRandomLegacyScenarioFromClients(legacyClientIds);
  if (!sourceScenario) {
    throw new Error("No reference transcripts found in active legacy bundles");
  }

  const model = process.env.SCENARIO_MODEL || "google/gemini-2.5-flash";
  const generated = await generateScript({
    model,
    projectName: project.name,
    targetAudience: project.target_audience,
    brandVoice: project.brand_voice,
    productName: product.name,
    productDescription: product.description,
    productReferenceNotes: product.product_reference_notes,
    ctaMode: product.cta_mode,
    ctaValue: product.cta_value,
    sourceScenario,
  });

  const sourceSnapshot = {
    id: sourceScenario.id,
    legacy_client_id: sourceScenario.client_id,
    legacy_client_name: sourceScenario.legacy_client_name,
    legacy_product_keyword: sourceScenario.legacy_product_keyword,
    title: sourceScenario.title,
    topic: sourceScenario.topic,
    source_kind: "legacy_reference_transcript",
    transcript: sourceScenario.script,
    reels_url: sourceScenario.reels_url,
    word_count: sourceScenario.word_count,
    duration_seconds: sourceScenario.duration_seconds,
    source_reference: sourceScenario.source_reference,
    quality_check: generated.qualityCheck,
  };
  const productSnapshot = {
    id: product.id,
    name: product.name,
    description: product.description,
    product_reference_notes: product.product_reference_notes,
    product_refs: product.product_refs,
  };

  const { rows } = await pool.query<OmniGeneratedScript>(
    `INSERT INTO omni_generated_scripts (
       project_id,
       product_id,
       source_legacy_scenario_id,
       source_legacy_client_id,
       title,
       hook,
       script,
       caption,
       cta_keyword,
       lead_magnet,
       source_snapshot,
       product_snapshot,
       model,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13, CURRENT_TIMESTAMP)
     RETURNING *`,
    [
      input.projectId,
      input.productId,
      sourceScenario.id,
      sourceScenario.client_id,
      generated.payload.title || null,
      generated.payload.hook || null,
      generated.payload.script || "",
      generated.payload.caption || null,
      generated.payload.cta_keyword || null,
      generated.payload.lead_magnet || null,
      JSON.stringify(sourceSnapshot),
      JSON.stringify(productSnapshot),
      model,
    ]
  );

  return normalizeScript(rows[0]);
}
