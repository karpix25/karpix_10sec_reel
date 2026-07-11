import { NextResponse } from "next/server";
import { buildGeneratedScriptPromptPreview } from "@/lib/server/omni/generated-scripts";
import { jsonError, parsePositiveInt, requireOmniUser } from "@/lib/server/omni/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ scriptId: string }> }
) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  const { searchParams } = new URL(request.url);
  const projectId = parsePositiveInt(searchParams.get("projectId"));
  const productId = parsePositiveInt(searchParams.get("productId"));
  const { scriptId: scriptIdParam } = await params;
  const scriptId = parsePositiveInt(scriptIdParam);

  if (!projectId) return jsonError("projectId is required");
  if (!productId) return jsonError("productId is required");
  if (!scriptId) return jsonError("scriptId is required");

  try {
    return NextResponse.json(
      await buildGeneratedScriptPromptPreview({
        projectId,
        productId,
        scriptId,
      })
    );
  } catch (error) {
    console.error("Omni generated script prompt preview error:", error);
    return jsonError(error instanceof Error ? error.message : "Internal Server Error", 500);
  }
}
