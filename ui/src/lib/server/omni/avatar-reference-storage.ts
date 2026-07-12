import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import { getS3Config, isS3Configured, putObjectToS3 } from "@/lib/server/s3-storage";
import type { OmniReferenceAsset } from "@/lib/omni/types";

export type AvatarReferenceUploadInput = {
  projectId: number;
  fileName: string;
  contentType: string;
  buffer: Buffer;
  requireS3?: boolean;
};

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+/, "") || "avatar-reference";
}

function extensionFromContentType(contentType: string) {
  if (contentType === "image/png") return ".png";
  if (contentType === "image/webp") return ".webp";
  if (contentType === "image/jpeg") return ".jpg";
  if (contentType === "video/mp4") return ".mp4";
  if (contentType === "video/webm") return ".webm";
  return "";
}

function getExtension(fileName: string, contentType: string) {
  return path.extname(fileName).toLowerCase() || extensionFromContentType(contentType) || ".jpg";
}

function getReferenceKind(contentType: string): OmniReferenceAsset["kind"] {
  return contentType.startsWith("video/") ? "video" : "image";
}

export async function saveAvatarReference(input: AvatarReferenceUploadInput) {
  const s3Config = getS3Config();
  const useS3 = isS3Configured(s3Config);
  if (input.requireS3 && !useS3) {
    throw new Error("S3 is required for generated avatar references but is not configured.");
  }
  const uploadDir = useS3
    ? path.join("/tmp", "omni-avatar-references", `project-${input.projectId}`)
    : path.join(process.cwd(), "public", "uploads", "omni-avatar-references", `project-${input.projectId}`);
  await mkdir(uploadDir, { recursive: true });

  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const safeName = sanitizeFileName(input.fileName).replace(/\.[^.]+$/, "");
  const fileName = `${stamp}_${safeName}${getExtension(input.fileName, input.contentType)}`;
  const localPath = path.join(uploadDir, fileName);
  await writeFile(localPath, input.buffer);

  let url = `/uploads/omni-avatar-references/project-${input.projectId}/${fileName}`;
  if (useS3) {
    url = await putObjectToS3(
      s3Config,
      `omni-avatar-references/project-${input.projectId}/${fileName}`,
      input.buffer,
      input.contentType || "application/octet-stream"
    );
    await rm(localPath, { force: true });
  }

  const ref: OmniReferenceAsset = {
    id: fileName,
    url,
    kind: getReferenceKind(input.contentType),
    role: "avatar_reference",
    label: input.fileName,
    storage_provider: useS3 ? "s3" : "manual",
    content_type: input.contentType || "application/octet-stream",
    status: "ready",
    is_primary: true,
    created_at: new Date().toISOString(),
  };

  return ref;
}
