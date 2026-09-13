import { NextResponse } from "next/server";
import { jsonError, parsePositiveInt, requireOmniUser } from "@/lib/server/omni/http";
import { retryOmniYandexDelivery } from "@/lib/server/omni/omni-yandex-delivery";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ reelId: string }> }) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;
  const reelId = parsePositiveInt((await context.params).reelId);
  if (!reelId) return jsonError("reelId is required");
  try { return NextResponse.json(await retryOmniYandexDelivery(reelId)); }
  catch (error) {
    const message = error instanceof Error ? error.message : "Доставка не завершена.";
    return jsonError(message, message.includes("уже выполняется") ? 409 : 400);
  }
}
