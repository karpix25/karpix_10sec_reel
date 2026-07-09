import { NextResponse } from "next/server";
import { jsonError, parsePositiveInt, requireOmniUser } from "@/lib/server/omni/http";
import { linkLegacyLibrary, listLegacyLibraryLinks } from "@/lib/server/omni/legacy-library-links";

export async function GET(request: Request) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  const { searchParams } = new URL(request.url);
  const projectId = parsePositiveInt(searchParams.get("projectId"));
  const productId = parsePositiveInt(searchParams.get("productId"));
  if (!projectId) return jsonError("projectId is required");

  try {
    return NextResponse.json(await listLegacyLibraryLinks(projectId, productId));
  } catch (error) {
    console.error("Omni legacy library links list error:", error);
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
    const legacyClientId = parsePositiveInt(body.legacyClientId);
    if (!projectId) return jsonError("projectId is required");
    if (!legacyClientId) return jsonError("legacyClientId is required");

    return NextResponse.json(await linkLegacyLibrary({ projectId, productId, legacyClientId }), { status: 201 });
  } catch (error) {
    console.error("Omni legacy library link error:", error);
    return jsonError(error instanceof Error ? error.message : "Internal Server Error", 500);
  }
}
