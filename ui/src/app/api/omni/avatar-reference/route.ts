import { NextResponse } from "next/server";
import { parsePositiveInt, requireOmniUser } from "@/lib/server/omni/http";
import { saveAvatarReference } from "@/lib/server/omni/avatar-reference-storage";

export async function POST(request: Request) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const formData = await request.formData();
    const projectId = parsePositiveInt(formData.get("projectId"));
    const file = formData.get("file");

    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Avatar reference file is required" }, { status: 400 });
    }
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      return NextResponse.json({ error: "Only image or video files are supported" }, { status: 400 });
    }

    const ref = await saveAvatarReference({
      projectId,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      buffer: Buffer.from(await file.arrayBuffer()),
    });

    return NextResponse.json({ ref });
  } catch (error) {
    console.error("Omni avatar reference upload error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
