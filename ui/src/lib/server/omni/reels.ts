import pool from "@/lib/db";
import { OmniClientAvatar, OmniReel, OmniReelSegment } from "@/lib/omni/types";
import { ensureOmniSchema } from "./schema";
import { getLegacyScenario } from "./legacy-scenarios";
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
  sourceLegacyScenarioId?: number | null;
  targetDurationSeconds?: unknown;
  brief?: unknown;
}) {
  await ensureOmniSchema();
  const targetDuration = resolveTargetDuration(input.targetDurationSeconds);
  const segmentCount = segmentCountForDuration(targetDuration);
  const brief = typeof input.brief === "string" && input.brief.trim() ? input.brief.trim() : null;
  const product = await requireOmniProductInProject(input.projectId, input.productId);
  const sourceScenario = input.sourceLegacyScenarioId ? await getLegacyScenario(input.sourceLegacyScenarioId) : null;
  const latestAvatar = await getLatestAvatarDraft(input.projectId);
  const sourceSnapshot = sourceScenario
    ? {
        id: sourceScenario.id,
        legacy_client_id: sourceScenario.client_id,
        legacy_client_name: sourceScenario.legacy_client_name,
        legacy_product_keyword: sourceScenario.legacy_product_keyword,
        title: sourceScenario.title,
        topic: sourceScenario.topic,
        script: sourceScenario.script,
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
        input.sourceLegacyScenarioId || null,
        targetDuration,
        segmentCount,
        brief,
        JSON.stringify(sourceSnapshot),
        JSON.stringify(productSnapshot),
        JSON.stringify(avatarSnapshot),
      ]
    );
    const reel = reelResult.rows[0];

    for (let index = 0; index < segmentCount; index += 1) {
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
          getSegmentRole(index + 1, segmentCount),
          buildDraftPrompt({
            index: index + 1,
            total: segmentCount,
            brief,
            script: sourceScenario?.script || null,
            productName: product.name,
            productRefs: product.product_refs,
            avatarPrompt: latestAvatar?.prompt || null,
          }),
          product.product_refs?.find((asset) => asset.is_primary)?.url || product.product_refs?.[0]?.url || null,
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

async function getLatestAvatarDraft(projectId: number) {
  const { rows } = await pool.query<OmniClientAvatar>(
    `SELECT *
     FROM omni_client_avatars
     WHERE project_id = $1
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
    [projectId]
  );
  return rows[0] || null;
}

function getSegmentRole(index: number, total: number) {
  if (index === 1) return "hook";
  if (index === total) return "cta_or_payoff";
  return "body";
}

function buildDraftPrompt({
  index,
  total,
  brief,
  script,
  productName,
  productRefs,
  avatarPrompt,
}: {
  index: number;
  total: number;
  brief: string | null;
  script: string | null;
  productName: string;
  productRefs: Array<{ url: string; label?: string }>;
  avatarPrompt: string | null;
}) {
  const role = getSegmentRole(index, total);
  const sourceLines = [
    `Omni reel segment ${index}/${total}. Duration exactly 10 seconds. Vertical 9:16.`,
    `Segment role: ${role}.`,
    `Product: ${productName}.`,
  ];
  if (brief) sourceLines.push(`Brief: ${brief}`);
  if (script) sourceLines.push(`Source script snapshot: ${script}`);
  if (avatarPrompt) sourceLines.push(`Client avatar prompt: ${avatarPrompt}`);
  if (productRefs?.length) sourceLines.push(`Product references: ${productRefs.map((asset) => asset.url).join(", ")}`);
  sourceLines.push("Keep visual continuity with previous/next 10s segment. Output must be stitch-friendly.");
  return sourceLines.join("\n");
}
