import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { jsonError, parsePositiveInt, requireOmniUser } from "@/lib/server/omni/http";
import { ensureOmniSchema } from "@/lib/server/omni/schema";
import { listProductReferenceMaterials } from "@/lib/server/omni/omni-reference-materials";
import { proposeScriptwriterTopics } from "@/lib/server/omni/omni-topic-proposer";
import { collectScriptwriterFrames } from "@/lib/server/omni/omni-scriptwriter-frames";

export async function POST(request: Request) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json().catch(() => ({}));
    const projectId = parsePositiveInt(body.projectId);
    const productId = parsePositiveInt(body.productId);
    if (!projectId) return jsonError("projectId is required");
    if (!productId) return jsonError("productId is required");

    await ensureOmniSchema();
    // Consider the whole library: backfill-created entries share created_at, so
    // a small limit can hide the concept-bearing (newest-prompt) materials.
    const library = await listProductReferenceMaterials(productId, 500);
    const materials = library.map((item) => ({
      ...item,
      conclusion:
        (item.material_json as { conclusion?: unknown } | null)?.conclusion &&
        typeof (item.material_json as { conclusion?: unknown }).conclusion === "string"
          ? ((item.material_json as { conclusion: string }).conclusion)
          : null,
    }));
    const { rows } = await pool.query<{ script: string; title: string | null; hook: string | null }>(
      "SELECT script, title, hook FROM omni_generated_scripts WHERE product_id = $1 ORDER BY created_at DESC LIMIT 100",
      [productId]
    );

    const proposals = proposeScriptwriterTopics(materials, rows, 5);
    const frames = collectScriptwriterFrames(materials);

    return NextResponse.json({
      proposals,
      frames: frames.map((frame) => ({ id: frame.id, title: frame.title, source: frame.source, structure: frame.structure })),
      materialsCount: materials.length,
    });
  } catch (error) {
    console.error("Omni scriptwriter topics error:", error);
    return jsonError("Internal Server Error", 500);
  }
}
