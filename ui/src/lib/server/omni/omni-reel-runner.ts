import pool from "@/lib/db";
import type { OmniReel, OmniReelSegment } from "@/lib/omni/types";
import { normalizeOmniGenerationProvider, type OmniGenerationProvider } from "@/lib/omni/provider";
import {
  downloadCometOmniVideo,
  retrieveCometOmniVideoTask,
  createCometOmniVideoTask,
  getCometReferenceImageFieldName,
  getCometReferenceImageTransport,
  shouldSendCometReferenceImage,
} from "./comet-video-client";
import {
  createKieOmniVideoTask,
  downloadKieOmniVideo,
  retrieveKieOmniTask,
  type KieOmniTask,
} from "./kie-omni-client";
import { ensureOmniSchema } from "./schema";
import { getLatestOmniClientAvatar } from "./avatars";
import { getOmniProject } from "./projects";
import { requireOmniProductInProject } from "./products";
import { stitchOmniSegments } from "./omni-video-stitcher";
import { uploadOmniFinalVideo, uploadOmniVideoBufferToS3 } from "./omni-video-storage";
import { selectReferenceImagesForComet } from "./omni-reference-images";
import { createOmniCompositeReference } from "./omni-composite-reference";

type ReelBundle = {
  reel: OmniReel;
  segments: OmniReelSegment[];
};

type ReferenceImage = { url: string; fieldName: string; role: string };
type ProviderTask = Awaited<ReturnType<typeof createCometOmniVideoTask>> | KieOmniTask;

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

function getAvatarCharacterId(reel: OmniReel) {
  const snapshot = reel.avatar_snapshot || {};
  const value = (snapshot as { kie_character_id?: unknown }).kie_character_id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function resolveAvatarCharacterId(reel: OmniReel) {
  const snapshotCharacterId = getAvatarCharacterId(reel);
  if (snapshotCharacterId) return snapshotCharacterId;

  const latestAvatar = await getLatestOmniClientAvatar(reel.project_id);
  return latestAvatar?.kie_character_id || null;
}

export async function submitOmniReel(reelId: number, providerInput?: unknown) {
  const { reel, segments } = await getReelBundle(reelId);
  const provider = normalizeOmniGenerationProvider(providerInput);
  if (!segments.length) throw new Error("Omni reel has no segments");
  const avatarReferenceUrl = getAvatarReferenceUrl(reel);
  const productReferenceUrl = getProductReferenceUrl(reel);
  const avatarCharacterId = await resolveAvatarCharacterId(reel);
  const referenceImageField = getCometReferenceImageFieldName();
  const referenceImageTransport = getCometReferenceImageTransport();
  const baseReferenceImages = shouldSendCometReferenceImage()
    ? [
        avatarReferenceUrl
          ? { url: avatarReferenceUrl, fieldName: referenceImageField, role: "avatar" }
          : null,
        productReferenceUrl
          ? { url: productReferenceUrl, fieldName: referenceImageField, role: "product" }
          : null,
      ].filter((image): image is ReferenceImage => Boolean(image))
    : [];
  const kieReferenceImages = productReferenceUrl
    ? [{ url: productReferenceUrl, fieldName: referenceImageField, role: "product" }]
    : [];
  if (provider === "kie-ai" && !avatarCharacterId) {
    await markOmniReelPreflightFailure({
      reelId: reel.id,
      provider,
      message: "KIE.ai Omni requires an approved avatar with saved character id",
    });
    throw new Error("KIE.ai Omni requires an approved avatar with saved character id");
  }
  const hasVisibleProductSegment = segments.some(
    (segment) => segment.creative_plan?.productRole !== "hidden"
  );
  const compositeReferenceUrl =
    provider === "cometapi" && hasVisibleProductSegment && shouldSendCometReferenceImage() &&
    referenceImageTransport === "url" && avatarReferenceUrl && productReferenceUrl
      ? await createOmniCompositeReference({
          projectId: reel.project_id,
          reelId: reel.id,
          avatarUrl: avatarReferenceUrl,
          productUrl: productReferenceUrl,
        })
      : null;
  const cometReferenceImages = compositeReferenceUrl
    ? [
        avatarReferenceUrl
          ? { url: avatarReferenceUrl, fieldName: referenceImageField, role: "avatar" }
          : null,
        { url: compositeReferenceUrl, fieldName: referenceImageField, role: "avatar_product_composite" },
      ].filter((image): image is ReferenceImage => Boolean(image))
    : baseReferenceImages;

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
    const productIsVisible = segment.creative_plan?.productRole !== "hidden";
    const segmentCometReferences = productIsVisible
      ? cometReferenceImages
      : cometReferenceImages.filter((image) => image.role === "avatar");
    const hiddenCometReferences = productIsVisible
      ? []
      : cometReferenceImages.filter((image) => image.role !== "avatar");
    const cometSelection = selectReferenceImagesForComet(
      segmentCometReferences,
      referenceImageTransport,
      segment.segment_index
    );
    const selectedReferenceImages = provider === "kie-ai"
      ? { sent: productIsVisible ? kieReferenceImages : [], skipped: productIsVisible ? [] : kieReferenceImages }
      : { ...cometSelection, skipped: [...cometSelection.skipped, ...hiddenCometReferences] };

    const requestPayload = {
      generation_provider: provider,
      model: provider === "kie-ai" ? "gemini-omni-video" : "omni-fast",
      seconds: getProviderDuration(provider, segment.duration_seconds || 10),
      aspect_ratio: "9:16",
      resolution: "720p",
      image_urls: selectedReferenceImages.sent.map((image) => image.url),
      character_ids: provider === "kie-ai" && avatarCharacterId ? [avatarCharacterId] : [],
      reference_images_sent: selectedReferenceImages.sent.length > 0,
      reference_image_field: selectedReferenceImages.sent.length ? referenceImageField : null,
      reference_image_transport:
        selectedReferenceImages.sent.length && provider === "cometapi" ? referenceImageTransport : "url",
      reference_images: selectedReferenceImages.sent.map((image) => ({
        role: image.role,
        url: image.url,
      })),
      reference_images_skipped: selectedReferenceImages.skipped.map((image) => ({
        role: image.role,
        url: image.url,
        reason: productIsVisible
          ? getSkippedReferenceReason(image.role, segment.segment_index, Boolean(compositeReferenceUrl))
          : "product_hidden_by_creative_strategy",
      })),
      reference_images_source: {
        avatar_url: avatarReferenceUrl,
        product_url: productReferenceUrl,
        composite_url: compositeReferenceUrl,
      },
      creative_plan: segment.creative_plan,
      prompt_validation: segment.prompt_validation,
    };

    let task: ProviderTask;
    try {
      task = await createProviderVideoTask({
        provider,
        prompt: segment.prompt,
        seconds: segment.duration_seconds || 10,
        resolution: "720p",
        referenceImages: selectedReferenceImages.sent,
        characterId: avatarCharacterId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await pool.query(
        `UPDATE omni_reel_segments
         SET status = 'failed',
             request_payload = $2::jsonb,
             generation_provider = $4,
             error_message = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [segment.id, JSON.stringify(requestPayload), message, provider]
      );
      await pool.query(
        "UPDATE omni_reels SET status = 'failed', error_message = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
        [reel.id, message]
      );
      throw error;
    }

    await pool.query(
      `UPDATE omni_reel_segments
       SET kie_task_id = $2,
           status = $3,
           request_payload = $4::jsonb,
           response_payload = $5::jsonb,
           generation_provider = $6,
           submitted_at = CURRENT_TIMESTAMP,
           error_message = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [
        segment.id,
        task.id,
        task.status === "queued" ? "submitted" : "processing",
        JSON.stringify(requestPayload),
        JSON.stringify(task.raw),
        provider,
      ]
    );
  }

  const updated = await getReelBundle(reelId);
  return updated.reel;
}

async function markOmniReelPreflightFailure(input: {
  reelId: number;
  provider: OmniGenerationProvider;
  message: string;
}) {
  await pool.query(
    `UPDATE omni_reels
     SET status = 'failed',
         error_message = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [input.reelId, input.message]
  );
  await pool.query(
    `UPDATE omni_reel_segments
     SET status = 'failed',
         generation_provider = $2,
         error_message = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE reel_id = $1
       AND status = 'draft'`,
    [input.reelId, input.provider, input.message]
  );
}

async function createProviderVideoTask(input: {
  provider: OmniGenerationProvider;
  prompt: string;
  seconds: number;
  resolution: string;
  referenceImages: ReferenceImage[];
  characterId: string | null;
}) {
  if (input.provider === "kie-ai") {
    if (!input.characterId) throw new Error("KIE.ai Omni requires character id");
    return createKieOmniVideoTask({
      prompt: input.prompt,
      duration: getProviderDuration(input.provider, input.seconds),
      aspectRatio: "9:16",
      resolution: input.resolution,
      imageUrls: input.referenceImages.map((image) => image.url),
      characterIds: [input.characterId],
    });
  }

  return createCometOmniVideoTask({
    prompt: input.prompt,
    seconds: input.seconds,
    aspectRatio: "9:16",
    resolution: input.resolution,
    referenceImages: input.referenceImages,
  });
}

function getProviderDuration(provider: OmniGenerationProvider, seconds: number): 8 | 10 {
  if (provider === "kie-ai") return seconds <= 8 ? 8 : 10;
  return seconds <= 8 ? 8 : 10;
}

function getSkippedReferenceReason(role: string, segmentIndex: number, hasCompositeReference: boolean) {
  if (segmentIndex === 1 && role === "avatar_product_composite") {
    return "product_reveal_reserved_for_later_segments";
  }
  if (hasCompositeReference && role === "avatar") {
    return "composite_reference_sent_instead";
  }
  return "url_transport_accepts_single_input_reference";
}

async function storeCompletedSegment(
  projectId: number,
  segment: OmniReelSegment,
  task: ProviderTask
) {
  if (!segment.kie_task_id) throw new Error(`Segment ${segment.segment_index} has no Omni task id`);
  const provider = normalizeOmniGenerationProvider(segment.generation_provider);
  const videoBuffer =
    provider === "kie-ai"
      ? await downloadKieOmniVideo(segment.kie_task_id)
      : await downloadCometOmniVideo(segment.kie_task_id);
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
      const provider = normalizeOmniGenerationProvider(segment.generation_provider);
      const task =
        provider === "kie-ai"
          ? await retrieveKieOmniTask(segment.kie_task_id)
          : await retrieveCometOmniVideoTask(segment.kie_task_id);
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
