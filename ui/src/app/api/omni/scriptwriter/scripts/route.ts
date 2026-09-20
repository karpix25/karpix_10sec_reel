import { NextResponse } from "next/server";
import { getOmniErrorStatus, jsonError, parsePositiveInt, requireOmniUser } from "@/lib/server/omni/http";
import { runOmniScriptwriter } from "@/lib/server/omni/omni-scriptwriter";

export async function POST(request: Request) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const projectId = parsePositiveInt(body.projectId);
    const productId = parsePositiveInt(body.productId);
    const topic = typeof body.topic === "string" ? body.topic.trim() : "";
    if (!projectId) return jsonError("projectId is required");
    if (!productId) return jsonError("productId is required");
    if (topic.length < 8) return jsonError("topic is required");

    const frameId = typeof body.frameId === "string" && body.frameId.trim() ? body.frameId.trim() : null;
    const materialIds = Array.isArray(body.materialIds)
      ? (body.materialIds as unknown[]).map((value) => parsePositiveInt(value)).filter((value): value is number => Boolean(value))
      : undefined;

    const result = await runOmniScriptwriter({ projectId, productId, topic, frameId, materialIds });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Omni scriptwriter run error:", error);
    return jsonError(error instanceof Error ? error.message : "Internal Server Error", getOmniErrorStatus(error));
  }
}
