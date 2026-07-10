import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { parsePositiveInt, requireOmniUser } from "@/lib/server/omni/http";
import { getS3Config, isS3Configured, putObjectToS3 } from "@/lib/server/s3-storage";
import type { OmniReferenceAsset } from "@/lib/omni/types";

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+/, "") || "product-image";
}

function getExtension(file: File) {
  const originalExt = path.extname(file.name);
  if (originalExt) return originalExt.toLowerCase();
  if (file.type === "image/png") return ".png";
  if (file.type === "image/webp") return ".webp";
  return ".jpg";
}

export async function POST(request: Request) {
  const auth = await requireOmniUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const formData = await request.formData();
    const projectId = parsePositiveInt(formData.get("projectId"));
    const files = formData.getAll("files").filter((item): item is File => item instanceof File);

    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    if (!files.length) {
      return NextResponse.json({ error: "At least one image is required" }, { status: 400 });
    }

    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length !== files.length) {
      return NextResponse.json({ error: "Only image files are supported" }, { status: 400 });
    }

    const s3Config = getS3Config();
    const useS3 = isS3Configured(s3Config);
    const uploadDir = useS3
      ? path.join("/tmp", "omni-product-images", `project-${projectId}`)
      : path.join(process.cwd(), "public", "uploads", "omni-product-images", `project-${projectId}`);
    await mkdir(uploadDir, { recursive: true });

    const refs: OmniReferenceAsset[] = [];

    for (const file of imageFiles) {
      const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const safeName = sanitizeFileName(file.name).replace(/\.[^.]+$/, "");
      const fileName = `${stamp}_${safeName}${getExtension(file)}`;
      const fileBuffer = Buffer.from(await file.arrayBuffer());
      const localPath = path.join(uploadDir, fileName);
      await writeFile(localPath, fileBuffer);

      let url = `/uploads/omni-product-images/project-${projectId}/${fileName}`;
      if (useS3) {
        url = await putObjectToS3(
          s3Config,
          `omni-product-images/project-${projectId}/${fileName}`,
          fileBuffer,
          file.type || "image/jpeg"
        );
        await rm(localPath, { force: true });
      }

      refs.push({
        id: fileName,
        url,
        kind: "image",
        role: refs.length === 0 ? "product_primary" : "product_secondary",
        label: file.name,
        storage_provider: useS3 ? "s3" : "manual",
        content_type: file.type || "image/jpeg",
        status: "ready",
        is_primary: refs.length === 0,
        created_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({ refs });
  } catch (error) {
    console.error("Omni product image upload error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
