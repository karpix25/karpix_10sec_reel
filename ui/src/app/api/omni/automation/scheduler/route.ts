import { NextResponse } from "next/server";
import { requireAutomationToken } from "@/lib/server/omni/internal-auth";
import { runOmniAutomationSchedulerCycle } from "@/lib/server/omni/omni-automation-scheduler";
import { jsonError } from "@/lib/server/omni/http";

export async function POST(request: Request) {
  const authError = requireAutomationToken(request);
  if (authError) return authError;

  try {
    return NextResponse.json(await runOmniAutomationSchedulerCycle());
  } catch (error) {
    console.error("Omni automation scheduler error:", error);
    return jsonError(error instanceof Error ? error.message : "Internal Server Error", 500);
  }
}
