import pool from "@/lib/db";
import type { OmniReel, OmniReelSegment } from "@/lib/omni/types";
import { normalizeOmniGenerationProvider, type OmniGenerationProvider } from "@/lib/omni/provider";
import {
  getCometReferenceImageFieldName,
  getCometReferenceImageTransport,
  shouldSendCometReferenceImage,
} from "./comet-video-client";
import { getOmniReelBundle } from "./omni-reel-bundle";
import { getLatestOmniClientAvatar } from "./avatars";
import {
  selectReferenceImagesForSegment,
  type ReelReferenceImage,
} from "./omni-reference-images";
import { resolveProductIdentityReferenceImageUrls } from "./omni-product-reference-images";
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
  type ProviderTask,
} from "./omni-provider-tasks";
import { processOmniReelSubtitlesIfNeeded } from "./omni-reel-subtitles";
import { stitchAndStoreReel } from "./omni-segment-completion";
import { detectKieOmniVoiceGender, resolveKieOmniAudioIds, type KieOmniVoiceGender } from "./kie-omni-audio";
import {
  applyOmniStoryboardFileReference,
  getOmniImageReferenceTag,
} from "./storyboard/omni-storyboard-file-reference";
import { hasProductVisibleStoryboardFrame } from "./omni-intro-product-contract";
import {
  appendOmniSegmentRetryPrompt,
  getOmniSegmentRetryCount,
} from "./omni-segment-retry";
import { syncOmniReelSegments } from "./omni-segment-sync";
import { assertOmniPhysicalPreflight } from "./omni-physical-preflight";
import { buildOmniReelFailureMessage } from "./omni-reel-failure";
import { approveOmniPilotIfReady, getOmniSegmentsForSubmission } from "./omni-pilot-gate";
import { ensureOmniReelStoryboardsForSubmission } from "./omni-reel-storyboard-gate";

const RUNNING_STATUSES = new Set(["queued", "submitted", "processing"]);

function hasRunningSegments(segments: OmniReelSegment[]) {
  return segments.some((segment) => RUNNING_STATUSES.has(String(segment.status || "").toLowerCase()));
}

function getAvatarReferenceUrl(reel: OmniReel) {
  const snapshot = reel.avatar_snapshot || {};
  const value = (snapshot as { reference_url?: unknown }).reference_url;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getProductReferenceUrls(reel: OmniReel) {
  return resolveProductIdentityReferenceImageUrls(reel.product_snapshot || {});
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

async function resolveKieAudioIds(reel: OmniReel) {
  const latestAvatar = await getLatestOmniClientAvatar(reel.project_id);
  const source = {
    ...(reel.avatar_snapshot || {}),
    latestAvatar,
    data: latestAvatar?.kie_character_payload,
  };
  return {
    audioIds: resolveKieOmniAudioIds(source),
    voiceGender: detectKieOmniVoiceGender(source),
  };
}

function getReelGenerationProvider(segments: OmniReelSegment[]) {
  return normalizeOmniGenerationProvider(
    segments.find((segment) => segment.generation_provider)?.generation_provider
  );
}

export async function submitOmniReel(reelId: number, providerInput?: unknown) {
  const bundle = await getOmniReelBundle(reelId);
  const reel = bundle.reel;
  let segments = bundle.segments;
  const provider = normalizeOmniGenerationProvider(providerInput);
  const continuityChainEnabled = isOmniContinuityChainEnabled();
  const providerContinuityEnabled = provider !== "kie-ai" && continuityChainEnabled;
  if (!segments.length) throw new Error("Omni reel has no segments");
  if (provider === "kie-ai" && reel.pilot_status !== "pending") {
    segments = await ensureOmniReelStoryboardsForSubmission({ reel, segments });
  }
  if (provider === "kie-ai") {
    const missingStoryboardSegments = getOmniSegmentsForSubmission(reel, segments)
      .filter((segment) => !segment.storyboard_reference_url)
      .map((segment) => segment.segment_index);
    if (missingStoryboardSegments.length) {
      const message = `KIE Omni requires a validated storyboard instruction board for segments: ${missingStoryboardSegments.join(", ")}`;
      await markOmniReelPreflightFailure({ reelId: reel.id, provider, message });
      throw new Error(message);
    }
  }
  const avatarReferenceUrl = getAvatarReferenceUrl(reel);
  const productReferenceUrls = getProductReferenceUrls(reel);
  const productReferenceUrl = productReferenceUrls[0] || null;
  const avatarCharacterId = await resolveAvatarCharacterId(reel);
  let kieAudioIds: string[] = [];
  let kieVoiceGender: KieOmniVoiceGender = "unknown";
  if (provider === "kie-ai") {
    try {
      const resolvedAudio = await resolveKieAudioIds(reel);
      kieAudioIds = resolvedAudio.audioIds;
      kieVoiceGender = resolvedAudio.voiceGender;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markOmniReelPreflightFailure({ reelId: reel.id, provider, message });
      throw error;
    }
  }
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
  const canonicalStoryboardReference = segments[0]?.storyboard_reference_url
    ? [{
        url: segments[0].storyboard_reference_url,
        fieldName: referenceImageField,
        role: "storyboard_canonical",
      }]
    : [];
  if (provider === "kie-ai" && !avatarCharacterId) {
    await markOmniReelPreflightFailure({
      reelId: reel.id,
      provider,
      message: "KIE.ai Omni requires an approved avatar with saved character id",
    });
    throw new Error("KIE.ai Omni requires an approved avatar with saved character id");
  }
  const productName = typeof reel.product_snapshot?.name === "string"
    ? reel.product_snapshot.name
    : typeof reel.product_snapshot?.product_name === "string"
      ? reel.product_snapshot.product_name
      : "";
  await assertOmniPhysicalPreflight({ reelId: reel.id, provider, productName, segments });
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

  for (const segment of getOmniSegmentsForSubmission(reel, segments)) {
    if (segment.kie_task_id || RUNNING_STATUSES.has(segment.status) || segment.status === "completed") continue;
    if (providerContinuityEnabled && isSegmentBlockedByContinuityChain(segment, segments)) break;
    if (!segment.prompt) throw new Error(`Segment ${segment.segment_index} has no prompt`);

    const continuity = providerContinuityEnabled
      ? await resolveContinuityReference({
          provider,
          segment,
          segments,
          fieldName: referenceImageField,
        })
      : {
          image: null,
          metadata: {
            enabled: false,
            applied: false,
            reason: provider === "kie-ai"
              ? "kie_uses_storyboard_reference_instead_of_previous_last_frame"
              : "continuity_chain_disabled",
          },
        };
    const productIsVisible = hasProductVisibleStoryboardFrame(segment.storyboard_plan, productName);
    const continuityImages = continuity.image ? [continuity.image] : [];
    const storyboardImages = segment.storyboard_reference_url
      ? [{ url: segment.storyboard_reference_url, fieldName: referenceImageField, role: "storyboard" }]
      : [];
    const canonicalStoryboardImages = segment.segment_index > 1 ? canonicalStoryboardReference : [];
    const selectedReferenceImages = selectReferenceImagesForSegment({
      provider,
      continuityImages,
      cometReferenceImages: [...storyboardImages, ...canonicalStoryboardImages, ...cometReferenceImages],
      kieReferenceImages: [...storyboardImages, ...canonicalStoryboardImages, ...kieReferenceImages],
      referenceImageTransport,
      segmentIndex: segment.segment_index,
      productIsVisible,
    });
    const retryPrompt = appendOmniSegmentRetryPrompt(segment.prompt, segment.request_payload);
    const continuityPrompt = continuity.image
      ? appendContinuityPromptContract(retryPrompt)
      : retryPrompt;
    const kieStoryboardPrompt = applyOmniStoryboardFileReference(
      continuityPrompt,
      selectedReferenceImages.sent
    );
    const providerPrompt =
      provider === "kie-ai"
        ? appendKieReferenceOrderPrompt(kieStoryboardPrompt, selectedReferenceImages.sent)
        : continuityPrompt;
    const usesStoryboardReference = selectedReferenceImages.sent.some((image) => image.role === "storyboard");
    const videoCharacterId = provider === "kie-ai" ? avatarCharacterId : null;
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
      resolution: provider === "kie-ai" ? "1080p" : "720p",
      provider_prompt: providerPrompt,
      image_urls: selectedReferenceImages.sent.map((image) => image.url),
      character_ids: provider === "kie-ai" && videoCharacterId ? [videoCharacterId] : [],
      audio_ids: provider === "kie-ai" ? kieAudioIds : [],
      audio_voice_gender: provider === "kie-ai" ? kieVoiceGender : null,
      reference_images_sent: selectedReferenceImages.sent.length > 0,
      reference_image_field: selectedReferenceImages.sent.length ? referenceImageField : null,
      reference_image_transport:
        selectedReferenceImages.sent.length && provider === "cometapi" ? referenceImageTransport : "url",
      reference_images: selectedReferenceImages.sent.map((image, index) => ({
        role: image.role,
        url: image.url,
        file_reference: provider === "kie-ai" ? getOmniImageReferenceTag(index) : null,
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
        storyboard_url: segment.storyboard_reference_url || null,
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
          ? ["gemini_image_reference_tags_v2"]
          : []),
        ...(provider === "kie-ai" && usesStoryboardReference ? ["storyboard_instruction_board_v2"] : []),
      ],
      creative_plan: segment.creative_plan,
      storyboard_plan: segment.storyboard_plan,
      storyboard_validation: segment.storyboard_validation,
      prompt_validation: segment.prompt_validation,
      omni_retry_count: getOmniSegmentRetryCount(segment.request_payload),
    };

    let task: ProviderTask;
    try {
      task = await createProviderVideoTask({
        provider,
        prompt: providerPrompt,
        seconds: segment.duration_seconds || 10,
        resolution: requestPayload.resolution,
        referenceImages: selectedReferenceImages.sent,
        characterId: videoCharacterId,
        audioIds: kieAudioIds,
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
    if (providerContinuityEnabled) break;
  }

  const updated = await getOmniReelBundle(reelId);
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
  if (input.hasCompositeReference && input.role === "avatar") {
    return "composite_reference_sent_instead";
  }
  return "url_transport_accepts_single_input_reference";
}

export async function syncOmniReel(reelId: number) {
  const { reel, segments } = await getOmniReelBundle(reelId);
  const syncResult = await syncOmniReelSegments({ reel, segments });

  const updated = await getOmniReelBundle(reelId);
  const hasFailed = updated.segments.some((segment) => segment.status === "failed");
  const allCompleted = updated.segments.length > 0 && updated.segments.every((segment) => segment.status === "completed");
  const hasPendingDraft = updated.segments.some(
    (segment) => !segment.kie_task_id && segment.status !== "completed" && segment.status !== "failed"
  );
  const pilotApproved = await approveOmniPilotIfReady(updated.reel, updated.segments);

  let stitchedNow = false;
  if (syncResult.retried) {
    await submitOmniReel(reelId, getReelGenerationProvider(updated.segments));
  } else if (hasFailed) {
    const failureMessage = buildOmniReelFailureMessage(updated.segments);
    await pool.query(
      `UPDATE omni_reel_segments
       SET status = 'failed',
           error_message = COALESCE(error_message, $2),
           updated_at = CURRENT_TIMESTAMP
       WHERE reel_id = $1
         AND status NOT IN ('completed', 'failed')`,
      [reelId, `Aborted because another segment failed: ${failureMessage}`]
    );
    await pool.query(
      "UPDATE omni_reels SET status = 'failed', error_message = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [reelId, failureMessage]
    );
  } else if (pilotApproved) {
    await submitOmniReel(reelId, getReelGenerationProvider(updated.segments));
  } else if (allCompleted && updated.reel.stitch_status !== "completed") {
    await stitchAndStoreReel({ reel: updated.reel, segments: updated.segments });
    stitchedNow = true;
  } else if (hasRunningSegments(updated.segments)) {
    await pool.query(
      "UPDATE omni_reels SET status = 'generating', stitch_status = 'not_ready', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [reelId]
    );
  } else if (isOmniContinuityChainEnabled() && hasPendingDraft) {
    await submitOmniReel(reelId, getReelGenerationProvider(updated.segments));
  }

  if (!stitchedNow) {
    await processOmniReelSubtitlesIfNeeded({ reelId });
  }

  return getOmniReelBundle(reelId);
}
