import { NextResponse } from "next/server";
import { jsonError, parsePositiveInt, requireOmniUser } from "@/lib/server/omni/http";
import {
  addReferenceMaterialToProductLibrary,
  listAvailableReferenceMaterials,
  listProductReferenceMaterials,
  removeReferenceMaterialFromProductLibrary,
} from "@/lib/server/omni/omni-reference-materials";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { productId: productIdParam } = await params;
    const productId = parsePositiveInt(productIdParam);
    if (!productId) return jsonError("productId is required");

    const url = new URL(request.url);
    const includeAvailable = url.searchParams.get("available") === "1";

    const library = await listProductReferenceMaterials(productId);
    return NextResponse.json({
      items: library,
      ...(includeAvailable ? { available: await listAvailableReferenceMaterials() } : {}),
    });
  } catch (error) {
    console.error("Omni product reference library list error:", error);
    return jsonError("Internal Server Error", 500);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { productId: productIdParam } = await params;
    const productId = parsePositiveInt(productIdParam);
    if (!productId) return jsonError("productId is required");

    const body = await request.json().catch(() => ({}));
    const materialId = parsePositiveInt(body.materialId);
    if (!materialId) return jsonError("materialId is required");

    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;
    await addReferenceMaterialToProductLibrary({ productId, materialId, note, addedBy: "user" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Omni product reference library add error:", error);
    return jsonError("Internal Server Error", 500);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { productId: productIdParam } = await params;
    const productId = parsePositiveInt(productIdParam);
    if (!productId) return jsonError("productId is required");

    const url = new URL(request.url);
    const materialId = parsePositiveInt(url.searchParams.get("materialId"));
    if (!materialId) return jsonError("materialId is required");

    await removeReferenceMaterialFromProductLibrary(productId, materialId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Omni product reference library remove error:", error);
    return jsonError("Internal Server Error", 500);
  }
}
