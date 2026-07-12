import { NextResponse } from "next/server";
import { generateAvatarReferenceWithGptImage2 } from "@/lib/server/omni/avatar-image-generator";
import {
  createOmniClientAvatar,
  deleteOmniClientAvatar,
  listOmniClientAvatars,
  updateOmniClientAvatarActive,
  updateOmniClientAvatarName,
  updateOmniClientAvatarStatus,
} from "@/lib/server/omni/avatars";
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

    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) return jsonError("Avatar prompt is required");
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";

    const manualReferenceUrl = typeof body.referenceUrl === "string" ? body.referenceUrl.trim() : "";
    const generatedReference = manualReferenceUrl
      ? null
      : await generateAvatarReferenceWithGptImage2(projectId, prompt);

    const avatar = await createOmniClientAvatar({
      projectId,
      displayName,
      prompt,
      referenceUrl: manualReferenceUrl || generatedReference?.referenceUrl || null,
      status: "draft",
      provider: manualReferenceUrl ? "manual_reference" : "gpt-image-2",
    });
    return NextResponse.json({ ...avatar, revised_prompt: generatedReference?.revisedPrompt || null }, { status: 201 });
  } catch (error) {
    console.error("Omni avatar create error:", error);
    return jsonError(error instanceof Error ? error.message : "Internal Server Error", 500);
  }
}

export async function PATCH(request: Request) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json().catch(() => ({}));
    const projectId = parsePositiveInt(body.projectId);
    const avatarId = parsePositiveInt(body.avatarId);
    if (!projectId) return jsonError("projectId is required");
    if (!avatarId) return jsonError("avatarId is required");

    if (typeof body.isActive === "boolean") {
      return NextResponse.json(
        await updateOmniClientAvatarActive({ projectId, avatarId, isActive: body.isActive })
      );
    }

    if (typeof body.displayName === "string") {
      return NextResponse.json(
        await updateOmniClientAvatarName({ projectId, avatarId, displayName: body.displayName })
      );
    }

    const status = typeof body.status === "string" ? body.status.trim() : "";
    if (status === "approved" || status === "draft") {
      return NextResponse.json(await updateOmniClientAvatarStatus({ projectId, avatarId, status }));
    }

    return jsonError("Unsupported avatar update");
  } catch (error) {
    console.error("Omni avatar update error:", error);
    return jsonError(error instanceof Error ? error.message : "Internal Server Error", 500);
  }
}

export async function DELETE(request: Request) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  const { searchParams } = new URL(request.url);
  const projectId = parsePositiveInt(searchParams.get("projectId"));
  const avatarId = parsePositiveInt(searchParams.get("avatarId"));
  if (!projectId) return jsonError("projectId is required");
  if (!avatarId) return jsonError("avatarId is required");

  try {
    await deleteOmniClientAvatar({ projectId, avatarId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Omni avatar delete error:", error);
    return jsonError(error instanceof Error ? error.message : "Internal Server Error", 500);
  }
}
