import { NextResponse } from "next/server";
import { getOmniErrorStatus, jsonError, parsePositiveInt, requireOmniUser } from "@/lib/server/omni/http";
import {
  generateOmniProductPhysicalContract,
  saveOmniProductPhysicalContract,
} from "@/lib/server/omni/products";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json().catch(() => ({}));
    const projectId = parsePositiveInt(body.projectId);
    const { productId: productIdParam } = await params;
    const productId = parsePositiveInt(productIdParam);
    if (!projectId) return jsonError("projectId is required");
    if (!productId) return jsonError("productId is required");

    if (body.mode === "generate") {
      return NextResponse.json(
        await generateOmniProductPhysicalContract({
          projectId,
          productId,
          userInstruction: body.userInstruction,
        })
      );
    }

    if (body.mode === "save") {
      return NextResponse.json(
        await saveOmniProductPhysicalContract({
          projectId,
          productId,
          contract: body.contract,
        })
      );
    }

    return jsonError("mode must be generate or save", 400);
  } catch (error) {
    console.error("Omni product physical contract error:", error);
    return jsonError(error instanceof Error ? error.message : "Internal Server Error", getOmniErrorStatus(error));
  }
}
