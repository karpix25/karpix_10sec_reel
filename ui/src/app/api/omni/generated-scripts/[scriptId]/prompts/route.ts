import { NextResponse } from "next/server";
import { getGeneratedScriptPromptPreview, prepareGeneratedScriptPromptPlan } from "@/lib/server/omni/generated-script-prompt-preparation";
import { getOmniErrorStatus, jsonError, parsePositiveInt, requireOmniUser } from "@/lib/server/omni/http";
import { normalizeOmniGenerationProvider } from "@/lib/omni/provider";

async function handle(
  request: Request,
  { params }: { params: Promise<{ scriptId: string }> },
  prepare: boolean,
) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  const { searchParams } = new URL(request.url);
  const projectId = parsePositiveInt(searchParams.get("projectId"));
  const productId = parsePositiveInt(searchParams.get("productId"));
  const generationProvider = normalizeOmniGenerationProvider(searchParams.get("provider"));
  const { scriptId: scriptIdParam } = await params;
  const scriptId = parsePositiveInt(scriptIdParam);

  if (!projectId) return jsonError("projectId is required");
  if (!productId) return jsonError("productId is required");
  if (!scriptId) return jsonError("scriptId is required");

  try {
    if (prepare) await prepareGeneratedScriptPromptPlan({ projectId, productId, scriptId, generationProvider });
    return NextResponse.json(
      await getGeneratedScriptPromptPreview({
        projectId,
        productId,
        scriptId,
        generationProvider,
      })
    );
  } catch (error) {
    console.error("Omni generated script prompt preview error:", error);
    return jsonError(error instanceof Error ? error.message : "Internal Server Error", getOmniErrorStatus(error));
  }
}

export function GET(request: Request, context: { params: Promise<{ scriptId: string }> }) {
  return handle(request, context, false);
}

export function POST(request: Request, context: { params: Promise<{ scriptId: string }> }) {
  return handle(request, context, true);
}
