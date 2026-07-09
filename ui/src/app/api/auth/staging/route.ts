import { NextResponse } from "next/server";
import { isValidStagingAuthPassword, STAGING_AUTH_COOKIE } from "@/lib/server/telegram-auth";

const STAGING_COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const password = typeof body?.password === "string" ? body.password : "";

    if (!isValidStagingAuthPassword(password)) {
      return NextResponse.json({ ok: false, error: "Invalid staging password" }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true }, { status: 200 });
    response.cookies.set({
      name: STAGING_AUTH_COOKIE,
      value: password,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: STAGING_COOKIE_MAX_AGE_SECONDS,
    });
    return response;
  } catch (error) {
    console.error("Staging auth error:", error);
    return NextResponse.json({ ok: false, error: "Internal Server Error" }, { status: 500 });
  }
}
