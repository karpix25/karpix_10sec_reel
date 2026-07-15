import { NextResponse } from "next/server";
import { buildTelegramBotUrl, createTelegramAuthRequest } from "@/lib/server/telegram-auth";
import { resolveTelegramAuthOrigin, sanitizeReturnPath } from "@/lib/server/telegram-auth-origin";

async function createAuthStartResponse(request: Request, returnToInput: unknown) {
  const returnTo = sanitizeReturnPath(returnToInput);
  const authRequest = await createTelegramAuthRequest(returnTo, resolveTelegramAuthOrigin(request));
  const botUrl = buildTelegramBotUrl(authRequest.payload);

  return {
    requestId: authRequest.requestId,
    botUrl,
    expiresAt: authRequest.expiresAt,
  };
}

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({}));
    const result = await createAuthStartResponse(request, (payload as { returnTo?: unknown })?.returnTo);

    return NextResponse.json({
      ok: true,
      requestId: result.requestId,
      botUrl: result.botUrl,
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    console.error("Telegram auth start error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to create Telegram auth request",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const result = await createAuthStartResponse(request, url.searchParams.get("returnTo"));
    return NextResponse.redirect(result.botUrl, { status: 302 });
  } catch (error) {
    console.error("Telegram auth start redirect error:", error);
    return new NextResponse(
      error instanceof Error ? error.message : "Failed to initialize Telegram auth",
      { status: 500 }
    );
  }
}
