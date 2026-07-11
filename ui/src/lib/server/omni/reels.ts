import pool from "@/lib/db";
import { OmniReel, OmniReelSegment } from "@/lib/omni/types";
import { ensureOmniSchema } from "./schema";
import { getLatestOmniClientAvatar } from "./avatars";
import { getGeneratedScript } from "./generated-scripts";
import { getLegacyScenario } from "./legacy-scenarios";
import { buildOmniSegmentPrompts } from "./omni-prompt-builder";
import { requireOmniProductInProject } from "./products";

const SEGMENT_SECONDS = 10;

function resolveTargetDuration(value: unknown) {
  const parsed = Number.parseInt(String(value || "30"), 10);
  return [30, 40].includes(parsed) ? parsed : 30;
}

function segmentCountForDuration(durationSeconds: number) {
  return Math.ceil(durationSeconds / SEGMENT_SECONDS);
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
  return rows;
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
  const targetDuration = resolveTargetDuration(input.targetDurationSeconds);
  const segmentCount = segmentCountForDuration(targetDuration);
  const brief = typeof input.brief === "string" && input.brief.trim() ? input.brief.trim() : null;
  const product = await requireOmniProductInProject(input.projectId, input.productId);
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
    product_refs: product.product_refs,
  };
  const avatarSnapshot = latestAvatar
    ? {
        id: latestAvatar.id,
        prompt: latestAvatar.prompt,
        reference_url: latestAvatar.reference_url,
        status: latestAvatar.status,
        provider: latestAvatar.provider,
      }
    : null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reelResult = await client.query<OmniReel>(
      `INSERT INTO omni_reels (
         project_id,
         product_id,
         source_legacy_scenario_id,
         target_duration_seconds,
         segment_count,
         status,
         brief,
         source_snapshot,
         product_snapshot,
         avatar_snapshot,
         stitch_status,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7::jsonb, $8::jsonb, $9::jsonb, 'not_ready', CURRENT_TIMESTAMP)
       RETURNING *`,
      [
        input.projectId,
        input.productId,
        generatedScript?.source_legacy_scenario_id || input.sourceLegacyScenarioId || null,
        targetDuration,
        segmentCount,
        brief,
        JSON.stringify(sourceSnapshot),
        JSON.stringify(productSnapshot),
        JSON.stringify(avatarSnapshot),
      ]
    );
    const reel = reelResult.rows[0];
    const promptPlan = buildOmniSegmentPrompts({
      generatedScript,
      legacyTranscript: sourceScenario?.script || null,
      product,
      avatar: latestAvatar,
      segmentCount,
      segmentSeconds: SEGMENT_SECONDS,
      brief,
    });

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
           reference_url
         )
         VALUES ($1, $2, $3, $4, 'draft', $5, $6)`,
        [
          reel.id,
          index + 1,
          SEGMENT_SECONDS,
          segmentPrompt.role,
          segmentPrompt.prompt,
          segmentPrompt.referenceUrl,
        ]
      );
    }

    await client.query("COMMIT");
    return reel;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
