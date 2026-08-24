import { NextResponse } from "next/server";
import { createOmniReel, listOmniReels, listOmniReelSegments } from "@/lib/server/omni/reels";
import { submitOmniReel } from "@/lib/server/omni/omni-reel-runner";
import { enqueueOmniAutomationJob } from "@/lib/server/omni/omni-automation-queue";
import { getGeneratedScript } from "@/lib/server/omni/generated-scripts";
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
    const provider = normalizeOmniGenerationProvider(body.provider);
    const sourceGeneratedScriptId = parsePositiveInt(body.sourceGeneratedScriptId);
    if (!projectId) return jsonError("projectId is required");
    if (!productId) return jsonError("productId is required");

    if (body.autoRun && sourceGeneratedScriptId) {
      const generatedScript = await getGeneratedScript({
        projectId,
        productId,
        scriptId: sourceGeneratedScriptId,
      });
      if (!generatedScript) return jsonError("Generated script is not ready for video creation", 409);
      const job = await enqueueOmniAutomationJob({
        projectId,
        productId,
        provider,
        sourceLegacyScenarioId: parsePositiveInt(body.sourceLegacyScenarioId),
        generatedScriptId: sourceGeneratedScriptId,
        priority: 100,
      });
      return NextResponse.json({ job }, { status: 202 });
    }

    const reel = await createOmniReel({
      projectId,
      productId,
      sourceGeneratedScriptId,
      sourceLegacyScenarioId: parsePositiveInt(body.sourceLegacyScenarioId),
      targetDurationSeconds: body.targetDurationSeconds,
      brief: body.brief,
      generationProvider: provider,
    });
    console.info("Omni reel create:", { reelId: reel.id, autoRun: Boolean(body.autoRun), provider });
    const result = body.autoRun ? await submitOmniReel(reel.id, provider) : reel;
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Omni reel create error:", error);
    return jsonError(error instanceof Error ? error.message : "Internal Server Error", getOmniErrorStatus(error));
  }
}
