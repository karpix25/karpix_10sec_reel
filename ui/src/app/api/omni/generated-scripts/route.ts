import { NextResponse } from "next/server";
import { createGeneratedScriptFromLegacy, listGeneratedScripts } from "@/lib/server/omni/generated-scripts";
import { jsonError, parsePositiveInt, requireOmniUser } from "@/lib/server/omni/http";

export async function GET(request: Request) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  const { searchParams } = new URL(request.url);
  const projectId = parsePositiveInt(searchParams.get("projectId"));
  const productId = parsePositiveInt(searchParams.get("productId"));
  if (!projectId) return jsonError("projectId is required");

  try {
    return NextResponse.json(await listGeneratedScripts(projectId, productId));
  } catch (error) {
    console.error("Omni generated scripts list error:", error);
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

    return NextResponse.json(await createGeneratedScriptFromLegacy({ projectId, productId }), { status: 201 });
  } catch (error) {
    console.error("Omni generated script create error:", error);
    return jsonError(error instanceof Error ? error.message : "Internal Server Error", 500);
  }
}
