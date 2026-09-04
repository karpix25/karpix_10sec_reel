import { NextResponse } from "next/server";
import { OMNI_GENERATION_PROVIDERS, type OmniGenerationProvider } from "@/lib/omni/provider";
import { getTelegramSessionUserFromRequest } from "@/lib/server/telegram-auth";
import { getOmniAutomationSettings } from "@/lib/server/omni/omni-automation-settings";
import { reserveOmniAutomationJobs } from "@/lib/server/omni/omni-automation-queue";

export async function POST(request: Request) {
  const user = await getTelegramSessionUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const projectId = Number(body?.projectId);
  const productId = body?.productId == null ? null : Number(body.productId);
  if (!Number.isSafeInteger(projectId) || projectId <= 0
    || (productId !== null && (!Number.isSafeInteger(productId) || productId <= 0))) {
    return NextResponse.json({ error: "Выберите бренд и обновите страницу перед запуском" }, { status: 400 });
  }
  if (!OMNI_GENERATION_PROVIDERS.includes(body?.provider as OmniGenerationProvider)) {
    return NextResponse.json({ error: "Unsupported generation provider" }, { status: 400 });
  }

  try {
    const settings = await getOmniAutomationSettings(projectId);
    const reservation = await reserveOmniAutomationJobs({
      projectId,
      productId,
      provider: body.provider,
      count: settings.daily_reel_limit,
      maxBacklogPerProject: settings.daily_reel_limit,
    });
    return NextResponse.json({ ok: true, projectId, queuedCount: reservation.jobs.length, stopped: reservation.stopped });
  } catch (error) {
    console.error("Omni manual automation run error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось запустить ролики" }, { status: 500 });
  }
}
