import { NextResponse } from "next/server";
import { editGeneratedScript } from "@/lib/server/omni/generated-script-edit";
import { getOmniErrorStatus, jsonError, parsePositiveInt, requireOmniUser } from "@/lib/server/omni/http";

export async function PATCH(request: Request, { params }: { params: Promise<{ scriptId: string }> }) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;
  const scriptId = parsePositiveInt((await params).scriptId);
  const body = await request.json().catch(() => ({}));
  const projectId = parsePositiveInt(body.projectId);
  const productId = parsePositiveInt(body.productId);
  if (!scriptId || !projectId || !productId) return jsonError("scriptId, projectId and productId are required");
  try {
    return NextResponse.json(await editGeneratedScript({ scriptId, projectId, productId, script: body.script }));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Internal Server Error", getOmniErrorStatus(error));
  }
}
