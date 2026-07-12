import pool from "@/lib/db";
import type { OmniReel, OmniReelSegment } from "@/lib/omni/types";
import {
  downloadCometOmniVideo,
  retrieveCometOmniVideoTask,
  createCometOmniVideoTask,
  getCometReferenceImageFieldName,
  getCometReferenceImageTransport,
  shouldSendCometReferenceImage,
} from "./comet-video-client";
import { ensureOmniSchema } from "./schema";
import { getOmniProject } from "./projects";
import { requireOmniProductInProject } from "./products";
import { stitchOmniSegments } from "./omni-video-stitcher";
import { uploadOmniFinalVideo, uploadOmniVideoBufferToS3 } from "./omni-video-storage";

type ReelBundle = {
  reel: OmniReel;
  segments: OmniReelSegment[];
};

const RUNNING_STATUSES = new Set(["queued", "submitted", "processing"]);

async function getReelBundle(reelId: number): Promise<ReelBundle> {
  await ensureOmniSchema();
  const reelResult = await pool.query<OmniReel>("SELECT * FROM omni_reels WHERE id = $1 LIMIT 1", [reelId]);
  const reel = reelResult.rows[0];
  if (!reel) throw new Error("Omni reel not found");

  const segmentResult = await pool.query<OmniReelSegment>(
    `SELECT *
     FROM omni_reel_segments
     WHERE reel_id = $1
     ORDER BY segment_index ASC`,
    [reelId]
  );

  return { reel, segments: segmentResult.rows };
}

function hasRunningSegments(segments: OmniReelSegment[]) {
  return segments.some((segment) => RUNNING_STATUSES.has(String(segment.status || "").toLowerCase()));
}

function getAvatarReferenceUrl(reel: OmniReel) {
  const snapshot = reel.avatar_snapshot || {};
  const value = (snapshot as { reference_url?: unknown }).reference_url;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getProductReferenceUrl(reel: OmniReel) {
  const snapshot = reel.product_snapshot || {};
  const refs = (snapshot as { product_refs?: unknown }).product_refs;
  if (!Array.isArray(refs)) return null;
  const primary = refs.find((ref) => Boolean((ref as { is_primary?: unknown }).is_primary)) || refs[0];
  const value = (primary as { url?: unknown } | undefined)?.url;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function submitOmniReel(reelId: number) {
  const { reel, segments } = await getReelBundle(reelId);
  if (!segments.length) throw new Error("Omni reel has no segments");
  const avatarReferenceUrl = getAvatarReferenceUrl(reel);
  const productReferenceUrl = getProductReferenceUrl(reel);
  const referenceImageField = getCometReferenceImageFieldName();
  const referenceImageTransport = getCometReferenceImageTransport();
  const referenceImages = shouldSendCometReferenceImage()
    ? [
        avatarReferenceUrl
          ? { url: avatarReferenceUrl, fieldName: referenceImageField, role: "avatar" }
          : null,
        productReferenceUrl
          ? { url: productReferenceUrl, fieldName: referenceImageField, role: "product" }
          : null,
      ].filter((image): image is { url: string; fieldName: string; role: string } => Boolean(image))
    : [];

  await pool.query(
    `UPDATE omni_reels
     SET status = 'generating',
         error_message = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [reel.id]
  );

  for (const segment of segments) {
    if (segment.kie_task_id || RUNNING_STATUSES.has(segment.status) || segment.status === "completed") continue;
    if (!segment.prompt) throw new Error(`Segment ${segment.segment_index} has no prompt`);

    const task = await createCometOmniVideoTask({
      prompt: segment.prompt,
      seconds: segment.duration_seconds || 10,
      aspectRatio: "9:16",
      resolution: "720p",
      referenceImages,
    });
    await pool.query(
      `UPDATE omni_reel_segments
       SET kie_task_id = $2,
           status = $3,
           request_payload = $4::jsonb,
           response_payload = $5::jsonb,
           submitted_at = CURRENT_TIMESTAMP,
           error_message = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [
        segment.id,
        task.id,
        task.status === "queued" ? "submitted" : "processing",
        JSON.stringify({
          model: "omni-fast",
          seconds: segment.duration_seconds || 10,
          aspect_ratio: "9:16",
          resolution: "720p",
          reference_images_sent: referenceImages.length > 0,
          reference_image_field: referenceImages.length ? referenceImageField : null,
          reference_image_transport: referenceImages.length ? referenceImageTransport : null,
          reference_images: referenceImages.map((image) => ({
            role: image.role,
            url: image.url,
          })),
        }),
        JSON.stringify(task.raw),
      ]
    );
  }

  const updated = await getReelBundle(reelId);
  return updated.reel;
}

async function storeCompletedSegment(
  projectId: number,
  segment: OmniReelSegment,
  task: Awaited<ReturnType<typeof retrieveCometOmniVideoTask>>
) {
  if (!segment.kie_task_id) throw new Error(`Segment ${segment.segment_index} has no CometAPI task id`);
  const videoBuffer = await downloadCometOmniVideo(segment.kie_task_id);
  const videoUrl = await uploadOmniVideoBufferToS3({
    projectId,
    reelId: segment.reel_id,
    fileName: `segment_${String(segment.segment_index).padStart(2, "0")}.mp4`,
    body: videoBuffer,
    segmentIndex: segment.segment_index,
  });

  await pool.query(
    `UPDATE omni_reel_segments
     SET status = 'completed',
         video_url = $2,
         response_payload = $3::jsonb,
         completed_at = CURRENT_TIMESTAMP,
         error_message = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [segment.id, videoUrl, JSON.stringify(task.raw)]
  );
}

async function loadSegmentBuffer(segment: OmniReelSegment) {
  if (!segment.video_url) throw new Error(`Segment ${segment.segment_index} video is missing`);
  const response = await fetch(segment.video_url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load segment ${segment.segment_index} from S3: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function stitchAndStoreReel(reelId: number) {
  const { reel, segments } = await getReelBundle(reelId);
  const project = await getOmniProject(reel.project_id);
  if (!project) throw new Error("Omni project not found");
  const product = await requireOmniProductInProject(reel.project_id, reel.product_id);

  await pool.query(
    "UPDATE omni_reels SET status = 'stitching', stitch_status = 'stitching', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
    [reelId]
  );

  const segmentBuffers = await Promise.all(segments.map(loadSegmentBuffer));
  const stitched = await stitchOmniSegments({ reelId, segmentBuffers });
  const stored = await uploadOmniFinalVideo({
    project,
    product,
    reelId,
    localFilePath: stitched.outputPath,
  });

  await pool.query(
    `UPDATE omni_reels
     SET status = $2,
         stitch_status = 'completed',
         final_video_url = $3,
         final_s3_url = $3,
         yandex_disk_path = $4,
         yandex_public_url = $5,
         yandex_status = $6,
         yandex_error = $7,
         error_message = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [
      reelId,
      "completed",
      stored.s3Url,
      stored.yandexPath,
      stored.yandexPublicUrl,
      stored.yandexStatus,
      stored.yandexError,
    ]
  );
}

export async function syncOmniReel(reelId: number) {
  const { reel, segments } = await getReelBundle(reelId);
  for (const segment of segments) {
    if (!segment.kie_task_id || segment.status === "completed") continue;

    try {
      const task = await retrieveCometOmniVideoTask(segment.kie_task_id);
      const status = task.status.toLowerCase();
      if (status === "completed") {
        await storeCompletedSegment(reel.project_id, segment, task);
      } else if (status === "failed" || status === "error") {
        await pool.query(
          `UPDATE omni_reel_segments
           SET status = 'failed',
               response_payload = $2::jsonb,
               error_message = $3,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [segment.id, JSON.stringify(task.raw), JSON.stringify(task.error || "CometAPI Omni segment failed")]
        );
      } else {
        await pool.query(
          `UPDATE omni_reel_segments
           SET status = 'processing',
               response_payload = $2::jsonb,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [segment.id, JSON.stringify(task.raw)]
        );
      }
    } catch (error) {
      await pool.query(
        "UPDATE omni_reel_segments SET error_message = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
        [segment.id, error instanceof Error ? error.message : "Omni segment sync failed"]
      );
    }
  }

  const updated = await getReelBundle(reelId);
  const hasFailed = updated.segments.some((segment) => segment.status === "failed");
  const allCompleted = updated.segments.length > 0 && updated.segments.every((segment) => segment.status === "completed");

  if (hasFailed) {
    await pool.query(
      "UPDATE omni_reels SET status = 'failed', error_message = 'One or more segments failed', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [reelId]
    );
  } else if (allCompleted && updated.reel.stitch_status !== "completed") {
    await stitchAndStoreReel(reelId);
  } else if (hasRunningSegments(updated.segments)) {
    await pool.query(
      "UPDATE omni_reels SET status = 'generating', stitch_status = 'not_ready', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [reelId]
    );
  }

  return getReelBundle(reelId);
}
