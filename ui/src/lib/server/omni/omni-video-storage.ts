import { readFile } from "fs/promises";
import pool from "@/lib/db";
import { getS3Config, putObjectToS3 } from "@/lib/server/s3-storage";
import { isYandexDiskConfigured, uploadVideoFileToYandexFolder } from "@/lib/server/yandex-disk";
import type { OmniProduct, OmniProject } from "@/lib/omni/types";

function sanitizePathSegment(value: string) {
  return value
    .replace(/[\\/<>:"|?*\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function sanitizeFileName(value: string) {
  return value
    .replace(/[\\/<>:"|?*\u0000-\u001f]+/g, "_")
    .replace(/\s+/g, "_")
    .trim()
    .slice(0, 180);
}

export function buildOmniVideoFileName(input: { project: OmniProject; product: OmniProduct; reelId: number }) {
  const brand = sanitizeFileName(input.project.name) || "brand";
  const product = sanitizeFileName(input.product.name) || "product";
  return `${brand}_${product}_reel_${input.reelId}.mp4`;
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
  const key = `omni-videos/project-${input.projectId}/reel-${input.reelId}/${section}`;
  return putObjectToS3(config, key, input.body, "video/mp4");
}

export async function resolveOmniYandexFolder(input: { project: OmniProject; product: OmniProduct }) {
  if (!input.project.legacy_client_id) {
    return buildDefaultOmniYandexFolder(input);
  }

  const { rows } = await pool.query<{ yandex_disk_folder_path: string | null }>(
    "SELECT yandex_disk_folder_path FROM clients WHERE id = $1 LIMIT 1",
    [input.project.legacy_client_id]
  );
  return rows[0]?.yandex_disk_folder_path || buildDefaultOmniYandexFolder(input);
}

export function buildDefaultOmniYandexFolder(input: { project: OmniProject; product: OmniProduct }) {
  const brand = sanitizePathSegment(input.project.name) || "brand";
  const product = sanitizePathSegment(input.product.name) || "product";
  return `disk:/omni/${brand}/${product}/ролики`;
}

export async function uploadOmniFinalVideo(input: {
  project: OmniProject;
  product: OmniProduct;
  reelId: number;
  localFilePath: string;
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
    const folderPath = await resolveOmniYandexFolder(input);
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
