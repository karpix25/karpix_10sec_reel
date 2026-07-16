import { NextResponse } from "next/server";
import { createOmniReel, listOmniReels, listOmniReelSegments } from "@/lib/server/omni/reels";
import { submitOmniReel } from "@/lib/server/omni/omni-reel-runner";
import { getOmniErrorStatus, jsonError, parsePositiveInt, requireOmniUser } from "@/lib/server/omni/http";
import { normalizeOmniGenerationProvider } from "@/lib/omni/provider";

export async function GET(request: Request) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  const { searchParams } = new URL(request.url);
  const projectId = parsePositiveInt(searchParams.get("projectId"));
  if (!projectId) return jsonError("projectId is required");

  try {
    const reels = await listOmniReels(projectId, parsePositiveInt(searchParams.get("productId")));
    const segments = await listOmniReelSegments(reels.map((reel) => reel.id));
    return NextResponse.json({ reels, segments });
  } catch (error) {
    console.error("Omni reels list error:", error);
    return jsonError("Internal Server Error", 500);
  }
}

export async function POST(request: Request) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json().catch(() => ({}));
    const projectId = parsePositiveInt(body.projectId);
    const productId = parsePositiveInt(body.productId);
    if (!projectId) return jsonError("projectId is required");
    if (!productId) return jsonError("productId is required");

    const reel = await createOmniReel({
      projectId,
      productId,
      sourceGeneratedScriptId: parsePositiveInt(body.sourceGeneratedScriptId),
      sourceLegacyScenarioId: parsePositiveInt(body.sourceLegacyScenarioId),
      targetDurationSeconds: body.targetDurationSeconds,
      brief: body.brief,
    });
    const provider = normalizeOmniGenerationProvider(body.provider);
    console.info("Omni reel create:", { reelId: reel.id, autoRun: Boolean(body.autoRun), provider });
    const result = body.autoRun ? await submitOmniReel(reel.id, provider) : reel;
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Omni reel create error:", error);
    return jsonError(error instanceof Error ? error.message : "Internal Server Error", getOmniErrorStatus(error));
  }
}
