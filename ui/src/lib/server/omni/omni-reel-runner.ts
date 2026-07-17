import pool from "@/lib/db";
import type { OmniReel, OmniReelSegment } from "@/lib/omni/types";
import { normalizeOmniGenerationProvider, type OmniGenerationProvider } from "@/lib/omni/provider";
import {
  getCometReferenceImageFieldName,
  getCometReferenceImageTransport,
  shouldSendCometReferenceImage,
} from "./comet-video-client";
import { ensureOmniSchema } from "./schema";
import { getLatestOmniClientAvatar } from "./avatars";
import {
  selectReferenceImagesForSegment,
  type ReelReferenceImage,
} from "./omni-reference-images";
import { resolveProductReferenceImageUrls } from "./omni-product-reference-images";
import { createOmniCompositeReference } from "./omni-composite-reference";
import {
  appendContinuityPromptContract,
  appendKieReferenceOrderPrompt,
} from "./omni-continuity-prompt";
import {
  isOmniContinuityChainEnabled,
  isSegmentBlockedByContinuityChain,
  resolveContinuityReference,
} from "./omni-continuity-reference";
import {
  createProviderVideoTask,
  getProviderDuration,
  retrieveProviderVideoTask,
  type ProviderTask,
} from "./omni-provider-tasks";
import { storeCompletedSegment, stitchAndStoreReel } from "./omni-segment-completion";

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

function getProductReferenceUrls(reel: OmniReel) {
  return resolveProductReferenceImageUrls(reel.product_snapshot || {});
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

function getReelGenerationProvider(segments: OmniReelSegment[]) {
  return normalizeOmniGenerationProvider(
    segments.find((segment) => segment.generation_provider)?.generation_provider
  );
}

export async function submitOmniReel(reelId: number, providerInput?: unknown) {
  const { reel, segments } = await getReelBundle(reelId);
  const provider = normalizeOmniGenerationProvider(providerInput);
  const continuityChainEnabled = isOmniContinuityChainEnabled();
  if (!segments.length) throw new Error("Omni reel has no segments");
  const avatarReferenceUrl = getAvatarReferenceUrl(reel);
  const productReferenceUrls = getProductReferenceUrls(reel);
  const productReferenceUrl = productReferenceUrls[0] || null;
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
      ].filter((image): image is ReelReferenceImage => Boolean(image))
    : [];
  const kieReferenceImages = productReferenceUrls.map((url, index) => ({
    url,
    fieldName: referenceImageField,
    role: index === 0 ? "product" : "product_secondary",
  }));
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
      ].filter((image): image is ReelReferenceImage => Boolean(image))
    : baseReferenceImages;

  await pool.query(
    `UPDATE omni_reels
     SET status = 'generating',
         error_message = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [reel.id]
  );
  await pool.query(
    `UPDATE omni_reel_segments
     SET generation_provider = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE reel_id = $1
       AND status = 'draft'`,
    [reel.id, provider]
  );

  for (const segment of segments) {
    if (segment.kie_task_id || RUNNING_STATUSES.has(segment.status) || segment.status === "completed") continue;
    if (isSegmentBlockedByContinuityChain(segment, segments)) break;
    if (!segment.prompt) throw new Error(`Segment ${segment.segment_index} has no prompt`);

    const continuity = await resolveContinuityReference({
      provider,
      segment,
      segments,
      fieldName: referenceImageField,
    });
    const productIsVisible = segment.creative_plan?.productRole !== "hidden";
    const continuityImages = continuity.image ? [continuity.image] : [];
    const selectedReferenceImages = selectReferenceImagesForSegment({
      provider,
      continuityImages,
      cometReferenceImages,
      kieReferenceImages,
      referenceImageTransport,
      segmentIndex: segment.segment_index,
      productIsVisible,
    });
    const continuityPrompt = continuity.image
      ? appendContinuityPromptContract(segment.prompt)
      : segment.prompt;
    const providerPrompt =
      provider === "kie-ai"
        ? appendKieReferenceOrderPrompt(continuityPrompt, selectedReferenceImages.sent)
        : continuityPrompt;
    const continuitySourceSegmentId =
      typeof continuity.metadata.sourceSegmentId === "number"
        ? continuity.metadata.sourceSegmentId
        : null;
    const continuityApplied = Boolean(continuity.metadata.applied);

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
        reason: getSkippedReferenceReason({
          role: image.role,
          segmentIndex: segment.segment_index,
          hasCompositeReference: Boolean(compositeReferenceUrl),
          productIsVisible,
        }),
      })),
      reference_images_source: {
        avatar_url: avatarReferenceUrl,
        product_url: productReferenceUrl,
        product_urls: productReferenceUrls,
        composite_url: compositeReferenceUrl,
        continuity_frame_url:
          typeof continuity.metadata.sourceFrameUrl === "string"
            ? continuity.metadata.sourceFrameUrl
            : null,
        continuity_provider_frame_url:
          typeof continuity.metadata.providerFrameUrl === "string"
            ? continuity.metadata.providerFrameUrl
            : null,
      },
      continuity: continuity.metadata,
      prompt_contracts: [
        ...(continuity.image ? ["previous_frame_continuity_v1"] : []),
        ...(provider === "kie-ai" && selectedReferenceImages.sent.length > 0
          ? ["kie_reference_order_v1"]
          : []),
      ],
      creative_plan: segment.creative_plan,
      prompt_validation: segment.prompt_validation,
    };

    let task: ProviderTask;
    try {
      task = await createProviderVideoTask({
        provider,
        prompt: providerPrompt,
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
           continuity_source_segment_id = $7,
           continuity_applied = $8,
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
        continuitySourceSegmentId,
        continuityApplied,
      ]
    );
    if (continuityChainEnabled) break;
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

function getSkippedReferenceReason(input: {
  role: string;
  segmentIndex: number;
  hasCompositeReference: boolean;
  productIsVisible: boolean;
}) {
  if (
    !input.productIsVisible &&
    (input.role === "product" || input.role === "product_secondary" || input.role === "avatar_product_composite")
  ) {
    return "product_hidden_by_creative_strategy";
  }
  if (input.segmentIndex === 1 && input.role === "avatar_product_composite") {
    return "product_reveal_reserved_for_later_segments";
  }
  if (input.hasCompositeReference && input.role === "avatar") {
    return "composite_reference_sent_instead";
  }
  return "url_transport_accepts_single_input_reference";
}

export async function syncOmniReel(reelId: number) {
  const { reel, segments } = await getReelBundle(reelId);
  for (const segment of segments) {
    if (!segment.kie_task_id || segment.status === "completed") continue;

    try {
      const task = await retrieveProviderVideoTask(segment.generation_provider, segment.kie_task_id);
      const status = task.status.toLowerCase();
      if (status === "completed") {
        await storeCompletedSegment({
          projectId: reel.project_id,
          segment,
          task,
        });
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
  const hasPendingDraft = updated.segments.some(
    (segment) => !segment.kie_task_id && segment.status !== "completed" && segment.status !== "failed"
  );

  if (hasFailed) {
    await pool.query(
      "UPDATE omni_reels SET status = 'failed', error_message = 'One or more segments failed', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [reelId]
    );
  } else if (allCompleted && updated.reel.stitch_status !== "completed") {
    await stitchAndStoreReel({ reel: updated.reel, segments: updated.segments });
  } else if (hasRunningSegments(updated.segments)) {
    await pool.query(
      "UPDATE omni_reels SET status = 'generating', stitch_status = 'not_ready', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [reelId]
    );
  } else if (isOmniContinuityChainEnabled() && hasPendingDraft) {
    await submitOmniReel(reelId, getReelGenerationProvider(updated.segments));
  }

  return getReelBundle(reelId);
}
