import { NextResponse } from "next/server";
import { createOmniProject, listOmniProjects } from "@/lib/server/omni/projects";
import { jsonError, requireOmniUser } from "@/lib/server/omni/http";

export async function GET(request: Request) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    return NextResponse.json(await listOmniProjects());
  } catch (error) {
    console.error("Omni projects list error:", error);
    return jsonError("Internal Server Error", 500);
  }
}

export async function POST(request: Request) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json().catch(() => ({}));
    const project = await createOmniProject({
      name: body.name,
      description: body.description,
      targetAudience: body.targetAudience,
      brandVoice: body.brandVoice,
      legacyClientId: body.legacyClientId,
      telegramChatId: body.telegramChatId,
      telegramTopicId: body.telegramTopicId,
      createdByTelegramId: auth.user?.telegramUserId,
    });
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("Omni project create error:", error);
    return jsonError(error instanceof Error ? error.message : "Internal Server Error", 500);
  }
}
