import pool from "@/lib/db";
import { OmniReel, OmniReelSegment } from "@/lib/omni/types";
import { ensureOmniSchema } from "./schema";
import { getLatestOmniClientAvatar } from "./avatars";
import { getGeneratedScript } from "./generated-scripts";
import { getLegacyScenario } from "./legacy-scenarios";
import { buildOmniSegmentPrompts } from "./omni-prompt-builder";
import { requireOmniProductInProject } from "./products";
import { getOmniProject } from "./projects";
import { listRecentLifeFormatIds } from "./omni-creative-history";
import { OMNI_SEGMENT_SECONDS, planOmniReelSegments } from "./omni-duration-planner";

function normalizeReel(row: OmniReel): OmniReel {
  return {
    ...row,
    source_generated_script_id:
      row.source_generated_script_id === null ? null : Number(row.source_generated_script_id),
    source_legacy_scenario_id:
      row.source_legacy_scenario_id === null ? null : Number(row.source_legacy_scenario_id),
  };
}

export async function listOmniReels(projectId: number, productId?: number | null) {
  await ensureOmniSchema();
  const values: unknown[] = [projectId];
  const clauses = ["project_id = $1"];
  if (productId) {
    values.push(productId);
    clauses.push(`product_id = $${values.length}`);
  }

  const { rows } = await pool.query<OmniReel>(
    `SELECT *
     FROM omni_reels
     WHERE ${clauses.join(" AND ")}
     ORDER BY created_at DESC, id DESC
     LIMIT 50`,
    values
  );
  return rows.map(normalizeReel);
}

export async function listOmniReelSegments(reelIds: number[]) {
  await ensureOmniSchema();
  if (!reelIds.length) return [];
  const { rows } = await pool.query<OmniReelSegment>(
    `SELECT *
     FROM omni_reel_segments
     WHERE reel_id = ANY($1::int[])
     ORDER BY reel_id DESC, segment_index ASC`,
    [reelIds]
  );
  return rows;
}

export async function createOmniReel(input: {
  projectId: number;
  productId: number;
  sourceGeneratedScriptId?: number | null;
  sourceLegacyScenarioId?: number | null;
  targetDurationSeconds?: unknown;
  brief?: unknown;
}) {
  await ensureOmniSchema();
  const brief = typeof input.brief === "string" && input.brief.trim() ? input.brief.trim() : null;
  const product = await requireOmniProductInProject(input.projectId, input.productId);
  const project = await getOmniProject(input.projectId);
  if (!project) throw new Error("Omni project not found");
  const generatedScript = input.sourceGeneratedScriptId
    ? await getGeneratedScript({
        projectId: input.projectId,
        productId: input.productId,
        scriptId: input.sourceGeneratedScriptId,
      })
    : null;
  if (input.sourceGeneratedScriptId && !generatedScript) {
    throw new Error("Generated script not found for this product");
  }
  const sourceScenario = input.sourceLegacyScenarioId ? await getLegacyScenario(input.sourceLegacyScenarioId) : null;
  const scriptText = generatedScript?.script || sourceScenario?.script || brief || "";
  const segmentPlan = planOmniReelSegments(scriptText);
  const targetDuration = segmentPlan.durationSeconds;
  const segmentCount = segmentPlan.segmentCount;
  const latestAvatar = await getLatestOmniClientAvatar(input.projectId);
  const sourceSnapshot = generatedScript
    ? {
        source_kind: "generated_script",
        id: generatedScript.id,
        source_legacy_scenario_id: generatedScript.source_legacy_scenario_id,
        source_legacy_client_id: generatedScript.source_legacy_client_id,
        title: generatedScript.title,
        hook: generatedScript.hook,
        script: generatedScript.script,
        source_snapshot: generatedScript.source_snapshot,
      }
    : sourceScenario
      ? {
        source_kind: "legacy_reference_transcript",
        id: sourceScenario.id,
        legacy_client_id: sourceScenario.client_id,
        legacy_client_name: sourceScenario.legacy_client_name,
        legacy_product_keyword: sourceScenario.legacy_product_keyword,
        title: sourceScenario.title,
        topic: sourceScenario.topic,
        transcript: sourceScenario.script,
        reels_url: sourceScenario.reels_url,
        source_reference: sourceScenario.source_reference,
      }
    : null;
  const productSnapshot = {
    id: product.id,
    name: product.name,
    description: product.description,
    product_reference_notes: product.product_reference_notes,
    target_duration_seconds: product.target_duration_seconds,
    cta_mode: product.cta_mode,
    cta_value: product.cta_value,
    product_refs: product.product_refs,
  };
  const avatarSnapshot = latestAvatar
    ? {
        id: latestAvatar.id,
        prompt: latestAvatar.prompt,
        reference_url: latestAvatar.reference_url,
        status: latestAvatar.status,
        provider: latestAvatar.provider,
        kie_character_id: latestAvatar.kie_character_id,
        kie_character_status: latestAvatar.kie_character_status,
      }
    : null;
  const recentFormatIds = await listRecentLifeFormatIds(input.projectId, input.productId);
  const promptPlan = buildOmniSegmentPrompts({
    generatedScript,
    legacyTranscript: sourceScenario?.script || null,
    product,
    avatar: latestAvatar,
    segmentCount,
    segmentSeconds: OMNI_SEGMENT_SECONDS,
    brief,
    targetAudience: project.target_audience,
    ctaMode: product.cta_mode,
    ctaValue: product.cta_value,
    recentFormatIds,
  });
  const creativeStrategy = promptPlan[0]?.creativeStrategy || null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reelResult = await client.query<OmniReel>(
      `INSERT INTO omni_reels (
       project_id,
       product_id,
       source_generated_script_id,
       source_legacy_scenario_id,
         target_duration_seconds,
         segment_count,
         status,
         brief,
         source_snapshot,
         product_snapshot,
         avatar_snapshot,
         creative_strategy,
         prompt_contract_version,
         stitch_status,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12, 'not_ready', CURRENT_TIMESTAMP)
       RETURNING *`,
      [
        input.projectId,
        input.productId,
        generatedScript?.id || input.sourceGeneratedScriptId || null,
        generatedScript?.source_legacy_scenario_id || input.sourceLegacyScenarioId || null,
        targetDuration,
        segmentCount,
        brief,
        JSON.stringify(sourceSnapshot),
        JSON.stringify(productSnapshot),
        JSON.stringify(avatarSnapshot),
        JSON.stringify(creativeStrategy),
        creativeStrategy?.version || null,
      ]
    );
    const reel = reelResult.rows[0];

    for (let index = 0; index < segmentCount; index += 1) {
      const segmentPrompt = promptPlan[index];
      await client.query(
        `INSERT INTO omni_reel_segments (
           reel_id,
           segment_index,
           duration_seconds,
           slot_role,
           status,
           prompt,
           reference_url,
           voiceover_text,
           creative_plan,
           prompt_validation
         )
         VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $8::jsonb, $9::jsonb)`,
        [
          reel.id,
          index + 1,
          OMNI_SEGMENT_SECONDS,
          segmentPrompt.role,
          segmentPrompt.prompt,
          segmentPrompt.referenceUrl,
          segmentPrompt.voiceoverText,
          JSON.stringify(segmentPrompt.creativePlan),
          JSON.stringify(segmentPrompt.validation),
        ]
      );
    }

    await client.query("COMMIT");
    return normalizeReel(reel);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
