import { NextResponse } from "next/server";
import { createOmniScenarioLink, listOmniScenarioLinks } from "@/lib/server/omni/scenario-links";
import { jsonError, parsePositiveInt, requireOmniUser } from "@/lib/server/omni/http";

export async function GET(request: Request) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  const { searchParams } = new URL(request.url);
  const projectId = parsePositiveInt(searchParams.get("projectId"));
  if (!projectId) return jsonError("projectId is required");

  try {
    return NextResponse.json(await listOmniScenarioLinks(projectId));
  } catch (error) {
    console.error("Omni scenario links list error:", error);
    return jsonError("Internal Server Error", 500);
  }
}

export async function POST(request: Request) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json().catch(() => ({}));
    const projectId = parsePositiveInt(body.projectId);
    const legacyScenarioId = parsePositiveInt(body.legacyScenarioId);
    if (!projectId) return jsonError("projectId is required");
    if (!legacyScenarioId) return jsonError("legacyScenarioId is required");

    const link = await createOmniScenarioLink({
      projectId,
      productId: parsePositiveInt(body.productId),
      legacyScenarioId,
      note: body.note,
    });
    return NextResponse.json(link, { status: 201 });
  } catch (error) {
    console.error("Omni scenario link create error:", error);
    return jsonError(error instanceof Error ? error.message : "Internal Server Error", 500);
  }
}
