import { NextResponse } from "next/server";
import { getOmniErrorStatus, jsonError, parsePositiveInt, requireOmniUser } from "@/lib/server/omni/http";
import { runOmniScriptDirector } from "@/lib/server/omni/omni-script-director";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ scriptId: string }> }
) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { scriptId: scriptIdParam } = await params;
    const scriptId = parsePositiveInt(scriptIdParam);
    if (!scriptId) return jsonError("scriptId is required");

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const materialIds = Array.isArray(body.materialIds)
      ? (body.materialIds as unknown[]).map((value) => parsePositiveInt(value)).filter((value): value is number => Boolean(value))
      : undefined;

    const result = await runOmniScriptDirector({ scriptId, materialIds });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Omni script director plan error:", error);
    return jsonError(error instanceof Error ? error.message : "Internal Server Error", getOmniErrorStatus(error));
  }
}
