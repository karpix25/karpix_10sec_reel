import { NextResponse } from "next/server";
import { requireAutomationToken } from "@/lib/server/omni/internal-auth";
import { processNextOmniAutomationJob } from "@/lib/server/omni/omni-automation-worker";
import { jsonError } from "@/lib/server/omni/http";

export async function POST(request: Request) {
  const authError = requireAutomationToken(request);
  if (authError) return authError;

  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await processNextOmniAutomationJob({ workerId: body.workerId }));
  } catch (error) {
    console.error("Omni automation worker error:", error);
    return jsonError(error instanceof Error ? error.message : "Internal Server Error", 500);
  }
}
