import { NextResponse } from "next/server";
import {
  getOmniAutomationSettings,
  updateOmniAutomationSettings,
} from "@/lib/server/omni/omni-automation-settings";
import { jsonError, parsePositiveInt, requireOmniUser } from "@/lib/server/omni/http";

export async function GET(request: Request) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  const { searchParams } = new URL(request.url);
  const projectId = parsePositiveInt(searchParams.get("projectId"));
  if (!projectId) return jsonError("projectId is required");

  try {
    return NextResponse.json(await getOmniAutomationSettings(projectId));
  } catch (error) {
    console.error("Omni automation settings get error:", error);
    return jsonError(error instanceof Error ? error.message : "Internal Server Error", 500);
  }
}

export async function PUT(request: Request) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json().catch(() => ({}));
    const projectId = parsePositiveInt(body.projectId);
    if (!projectId) return jsonError("projectId is required");

    return NextResponse.json(
      await updateOmniAutomationSettings({
        projectId,
        autoGenerateReels: body.autoGenerateReels,
        dailyReelLimit: body.dailyReelLimit,
        projectReelLimit: body.projectReelLimit,
      })
    );
  } catch (error) {
    console.error("Omni automation settings update error:", error);
    return jsonError(error instanceof Error ? error.message : "Internal Server Error", 500);
  }
}
