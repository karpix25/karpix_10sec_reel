import { NextResponse } from "next/server";
import { createOmniClientAvatar, listOmniClientAvatars } from "@/lib/server/omni/avatars";
import { jsonError, parsePositiveInt, requireOmniUser } from "@/lib/server/omni/http";

export async function GET(request: Request) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  const { searchParams } = new URL(request.url);
  const projectId = parsePositiveInt(searchParams.get("projectId"));
  if (!projectId) return jsonError("projectId is required");

  try {
    return NextResponse.json(await listOmniClientAvatars(projectId));
  } catch (error) {
    console.error("Omni avatars list error:", error);
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

    const avatar = await createOmniClientAvatar({
      projectId,
      prompt: body.prompt,
      referenceUrl: body.referenceUrl,
    });
    return NextResponse.json(avatar, { status: 201 });
  } catch (error) {
    console.error("Omni avatar create error:", error);
    return jsonError(error instanceof Error ? error.message : "Internal Server Error", 500);
  }
}
