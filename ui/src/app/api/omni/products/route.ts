import { NextResponse } from "next/server";
import { jsonError, parsePositiveInt, requireOmniUser } from "@/lib/server/omni/http";
import { createOmniProduct, deleteOmniProduct, listOmniProducts, updateOmniProduct } from "@/lib/server/omni/products";

export async function GET(request: Request) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  const { searchParams } = new URL(request.url);
  const projectId = parsePositiveInt(searchParams.get("projectId"));
  if (!projectId) return jsonError("projectId is required");

  try {
    return NextResponse.json(await listOmniProducts(projectId));
  } catch (error) {
    console.error("Omni products list error:", error);
    return jsonError("Internal Server Error", 500);
  }
}

export async function POST(request: Request) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json().catch(() => ({}));
    const projectId = parsePositiveInt(body.projectId);
    if (!projectId) return jsonError("projectId is required");

    const product = await createOmniProduct({
      projectId,
      name: body.name,
      description: body.description,
      productReferenceNotes: body.productReferenceNotes,
      avatarReferenceNotes: body.avatarReferenceNotes,
      targetDurationSeconds: body.targetDurationSeconds,
      productRefs: body.productRefs,
      avatarRefs: body.avatarRefs,
    });
    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error("Omni product create error:", error);
    return jsonError(error instanceof Error ? error.message : "Internal Server Error", 500);
  }
}

export async function PATCH(request: Request) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json().catch(() => ({}));
    const projectId = parsePositiveInt(body.projectId);
    const productId = parsePositiveInt(body.productId);
    if (!projectId) return jsonError("projectId is required");
    if (!productId) return jsonError("productId is required");

    return NextResponse.json(
      await updateOmniProduct({
        projectId,
        productId,
        name: body.name,
        description: body.description,
        productReferenceNotes: body.productReferenceNotes,
        avatarReferenceNotes: body.avatarReferenceNotes,
        productRefs: body.productRefs,
        avatarRefs: body.avatarRefs,
      })
    );
  } catch (error) {
    console.error("Omni product update error:", error);
    return jsonError(error instanceof Error ? error.message : "Internal Server Error", 500);
  }
}

export async function DELETE(request: Request) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { searchParams } = new URL(request.url);
    const projectId = parsePositiveInt(searchParams.get("projectId"));
    const productId = parsePositiveInt(searchParams.get("productId"));
    if (!projectId) return jsonError("projectId is required");
    if (!productId) return jsonError("productId is required");

    return NextResponse.json({ deleted: await deleteOmniProduct({ projectId, productId }) });
  } catch (error) {
    console.error("Omni product delete error:", error);
    return jsonError(error instanceof Error ? error.message : "Internal Server Error", 500);
  }
}
