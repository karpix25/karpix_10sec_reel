import { readFile } from "fs/promises";
import pool from "@/lib/db";
import { getS3Config, putObjectToS3 } from "@/lib/server/s3-storage";
import { isYandexDiskConfigured, uploadVideoFileToYandexFolder } from "@/lib/server/yandex-disk";
import type { OmniProduct, OmniProject, OmniReel } from "@/lib/omni/types";
import { buildOmniStorageKey } from "./omni-storage-path";

const YANDEX_VIDEO_ROOT = "ВИДЕО";
const OMNI_CONTENT_FOLDER = "omni";

function sanitizePathSegment(value: string) {
  return value
    .replace(/[\\/<>:"|?*\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function sanitizeFileName(value: string) {
  return value
    .replace(/[\\/<>:"|?*\u0000-\u001f\s]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .trim()
    .slice(0, 180);
}

export function buildOmniVideoFileName(input: { project: OmniProject; product: OmniProduct; reelId: number }) {
  const brand = sanitizeFileName(input.project.name) || "brand";
  const product = sanitizeFileName(input.product.name) || "product";
  const uniqueStamp = new Date()
    .toISOString()
    .replace(/\D/g, "")
    .slice(0, 14);
  return `${brand}_${product}_reel_${input.reelId}_${uniqueStamp}.mp4`;
}

export async function uploadOmniVideoBufferToS3(input: {
  projectId: number;
  reelId: number;
  fileName: string;
  body: Buffer;
  segmentIndex?: number;
}) {
  const config = getS3Config();
  const section =
    typeof input.segmentIndex === "number"
      ? `segments/${String(input.segmentIndex).padStart(2, "0")}_${input.fileName}`
      : `final/${input.fileName}`;
  const key = buildOmniStorageKey(`omni-videos/project-${input.projectId}/reel-${input.reelId}/${section}`);
  return putObjectToS3(config, key, input.body, "video/mp4");
}

export async function uploadOmniImageBufferToS3(input: {
  projectId: number;
  reelId: number;
  fileName: string;
  body: Buffer;
  contentType?: string;
  segmentIndex?: number;
}) {
  const config = getS3Config();
  const section =
    typeof input.segmentIndex === "number"
      ? `frames/${String(input.segmentIndex).padStart(2, "0")}_${input.fileName}`
      : `frames/${input.fileName}`;
  const key = buildOmniStorageKey(`omni-videos/project-${input.projectId}/reel-${input.reelId}/${section}`);
  return putObjectToS3(config, key, input.body, input.contentType || "image/jpeg");
}

export async function uploadOmniGeneratedScriptStoryboardImageBufferToS3(input: {
  projectId: number;
  scriptId: number;
  fileName: string;
  body: Buffer;
  contentType?: string;
  segmentIndex: number;
}) {
  const config = getS3Config();
  const section = `frames/${String(input.segmentIndex).padStart(2, "0")}_${input.fileName}`;
  const key = buildOmniStorageKey(`omni-videos/project-${input.projectId}/generated-script-${input.scriptId}/storyboard/${section}`);
  return putObjectToS3(config, key, input.body, input.contentType || "image/jpeg");
}

export async function resolveOmniYandexFolder(input: { project: OmniProject; product: OmniProduct }) {
  return resolveOmniYandexFolderPath(input);
}

export async function resolveOmniYandexFolderPath(input: {
  project: OmniProject;
  product: OmniProduct;
  reel?: Pick<OmniReel, "avatar_snapshot"> | null;
}) {
  const brandFolderPath = await resolveOmniBrandYandexFolder(input);
  const avatarFolder = resolveAvatarFolderName(input.reel?.avatar_snapshot);
  const productFolder = sanitizePathSegment(input.product.name) || "product";
  return `${brandFolderPath}/${avatarFolder}/${productFolder}/${OMNI_CONTENT_FOLDER}`;
}

async function resolveOmniBrandYandexFolder(input: { project: OmniProject; product: OmniProduct }) {
  if (!input.project.legacy_client_id) {
    return buildDefaultOmniBrandYandexFolder(input);
  }

  const { rows } = await pool.query<{ yandex_disk_folder_path: string | null }>(
    "SELECT yandex_disk_folder_path FROM clients WHERE id = $1 LIMIT 1",
    [input.project.legacy_client_id]
  );
  return normalizeBrandFolderPath(rows[0]?.yandex_disk_folder_path) || buildDefaultOmniBrandYandexFolder(input);
}

export function buildDefaultOmniYandexFolder(input: { project: OmniProject; product: OmniProduct }) {
  const productFolder = sanitizePathSegment(input.product.name) || "product";
  return `${buildDefaultOmniBrandYandexFolder(input)}/avatar/${productFolder}/${OMNI_CONTENT_FOLDER}`;
}

export function buildDefaultOmniBrandYandexFolder(input: { project: OmniProject }) {
  const brand = sanitizePathSegment(input.project.name) || "brand";
  return `disk:/${YANDEX_VIDEO_ROOT}/${brand}`;
}

function normalizeBrandFolderPath(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const withoutPrefix = raw.replace(/^disk:\/*/i, "").replace(/^\/+/, "");
  const segments = withoutPrefix
    .split("/")
    .map((segment) => sanitizePathSegment(segment))
    .filter(Boolean);
  if (!segments.length) return null;
  return `disk:/${segments.join("/")}`;
}

function resolveAvatarFolderName(snapshot?: Record<string, unknown> | null) {
  const displayName = typeof snapshot?.display_name === "string" ? snapshot.display_name : "";
  const id = typeof snapshot?.id === "number" || typeof snapshot?.id === "string" ? String(snapshot.id) : "";
  return sanitizePathSegment(displayName) || (id ? `Avatar ${sanitizePathSegment(id)}` : "avatar");
}

export async function uploadOmniFinalVideo(input: {
  project: OmniProject;
  product: OmniProduct;
  reelId: number;
  localFilePath: string;
  reel?: Pick<OmniReel, "avatar_snapshot"> | null;
}) {
  const fileName = buildOmniVideoFileName(input);
  const finalBuffer = await readFile(input.localFilePath);
  const s3Url = await uploadOmniVideoBufferToS3({
    projectId: input.project.id,
    reelId: input.reelId,
    fileName,
    body: finalBuffer,
  });

  if (!isYandexDiskConfigured()) {
    return { fileName, s3Url, yandexStatus: "skipped" as const, yandexPath: null, yandexPublicUrl: null, yandexError: null };
  }

  try {
    const folderPath = await resolveOmniYandexFolderPath(input);
    const yandex = await uploadVideoFileToYandexFolder({
      localFilePath: input.localFilePath,
      folderPath,
      fileName,
    });
    return {
      fileName,
      s3Url,
      yandexStatus: "completed" as const,
      yandexPath: yandex.filePath,
      yandexPublicUrl: yandex.publicUrl,
      yandexError: null,
    };
  } catch (error) {
    return {
      fileName,
      s3Url,
      yandexStatus: "failed" as const,
      yandexPath: null,
      yandexPublicUrl: null,
      yandexError: error instanceof Error ? error.message : "Yandex Disk upload failed",
    };
  }
}
