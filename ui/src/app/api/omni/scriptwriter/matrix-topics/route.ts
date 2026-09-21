import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getOmniErrorStatus, jsonError, parsePositiveInt, requireOmniUser } from "@/lib/server/omni/http";
import { ensureOmniSchema } from "@/lib/server/omni/schema";
import { getOmniProduct } from "@/lib/server/omni/products";
import { listProductReferenceMaterials } from "@/lib/server/omni/omni-reference-materials";
import { collectScriptwriterFrames } from "@/lib/server/omni/omni-scriptwriter-frames";
import {
  composeTopicAxes,
  defaultTopicAxesRequest,
  getCachedTopicAxes,
  saveTopicAxes,
} from "@/lib/server/omni/omni-product-topic-axes";
import { buildMatrixCells, matrixUsageFromRows, pickMatrixProposals } from "@/lib/server/omni/omni-topic-matrix";

export async function POST(request: Request) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const projectId = parsePositiveInt(body.projectId);
    const productId = parsePositiveInt(body.productId);
    const limit = Math.min(parsePositiveInt(body.limit) || 5, 20);
    if (!projectId) return jsonError("projectId is required");
    if (!productId) return jsonError("productId is required");

    await ensureOmniSchema();
    const product = await getOmniProduct(productId);
    if (!product || product.project_id !== projectId) return jsonError("Product not found in project", 404);

    let cached = await getCachedTopicAxes(productId);
    if (!cached) {
      const axes = await composeTopicAxes({
        productCard: {
          name: product.name,
          description: product.description,
          notes: product.product_reference_notes,
          visual_summary: product.product_visual_profile?.prompt_summary || null,
          physical_contract: product.product_physical_contract || null,
        },
        request: defaultTopicAxesRequest,
      });
      await saveTopicAxes(productId, axes);
      cached = await getCachedTopicAxes(productId);
    }
    if (!cached) return jsonError("Topic axes extraction failed", 500);

    const library = await listProductReferenceMaterials(productId, 500);
    const frames = collectScriptwriterFrames(library);
    const cells = buildMatrixCells(cached.axes, frames);

    const { rows } = await pool.query<{ matrix_cell: unknown; created_at: string }>(
      `SELECT source_snapshot->'matrix_cell' AS matrix_cell, created_at
       FROM omni_generated_scripts
       WHERE product_id = $1 AND source_snapshot->'matrix_cell'->>'signature' IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 2000`,
      [productId]
    );
    const usage = matrixUsageFromRows(rows);

    const proposals = pickMatrixProposals({ cells, usage, limit }).map((cell) => ({
      ...cell,
      frame_title: cell.frameTitle,
      matrix_cell: { signature: cell.signature, benefit: cell.benefitTitle, audience: cell.audienceTitle, frameId: cell.frameId },
    }));

    return NextResponse.json({
      proposals,
      axes: {
        benefits: cached.axes.benefits.length,
        audiences: cached.axes.audiences.length,
        objections: cached.axes.objections.length,
        use_cases: cached.axes.use_cases.length,
        extractedAt: cached.updatedAt,
      },
      frames: frames.map((frame) => ({ id: frame.id, title: frame.title, source: frame.source })),
      totalCells: cells.length,
      usedCells: usage.size,
    });
  } catch (error) {
    console.error("Omni topic matrix error:", error);
    return jsonError(error instanceof Error ? error.message : "Internal Server Error", getOmniErrorStatus(error));
  }
}
