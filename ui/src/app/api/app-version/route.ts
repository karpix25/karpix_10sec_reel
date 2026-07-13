import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(
    { version: process.env.APP_VERSION || "local" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
