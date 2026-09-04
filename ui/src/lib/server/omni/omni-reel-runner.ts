import pool from "@/lib/db";
import type { OmniClientAvatar, OmniReel, OmniReelSegment } from "@/lib/omni/types";
import { normalizeOmniGenerationProvider } from "@/lib/omni/provider";
import { getCometReferenceImageFieldName, getCometReferenceImageTransport, shouldSendCometReferenceImage } from "./comet-video-client";
import { ensureOmniSchema } from "./schema";
import { selectReferenceImagesForSegment, type ReelReferenceImage } from "./omni-reference-images";
import { resolveProductReferenceImageUrls } from "./omni-product-reference-images";
import { createOmniCompositeReference } from "./omni-composite-reference";
import { appendContinuityPromptContract, appendKieReferenceOrderPrompt } from "./omni-continuity-prompt";
import { isOmniContinuityChainEnabled, isSegmentBlockedByContinuityChain, resolveContinuityReference } from "./omni-continuity-reference";
import { getProviderDuration, type ProviderTask } from "./omni-provider-tasks";
import { createOmniVideoTask } from "./omni-video-task-dispatch";
import { processOmniReelSubtitlesIfNeeded } from "./omni-reel-subtitles";
import { stitchAndStoreReel } from "./omni-segment-completion";
import { detectKieOmniVoiceGender, resolveKieOmniAudioIds, type KieOmniVoiceGender } from "./kie-omni-audio";
import { applyOmniStoryboardFileReference } from "./storyboard/omni-storyboard-file-reference";
import { hasProductVisibleStoryboardFrame } from "./omni-intro-product-contract";
import { syncOmniReelSegments } from "./omni-segment-sync";
import { assertOmniPhysicalPreflight } from "./omni-physical-preflight";
import { recordKieGenerationCost } from "./omni-generation-costs";
import { withOmniReelExecutionLock } from "./omni-reel-execution-lock";
import { assertReferenceScenePromptContract, isAvatarFreeReferenceScene, normalizeReferenceSceneMode, resolveReferenceSceneMode } from "./omni-reference-scene-mode";
import { extractDirectorBriefFromSnapshot } from "./director-analysis-types";
import { isVoiceoverMontageReference, resolveReferenceFormatMode } from "./omni-reference-format-mode";
import { getSkippedReferenceReason, markOmniReelPreflightFailure } from "./omni-reel-preflight-failure";
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

export async function getOmniReelBundle(reelId: number) {
  return getReelBundle(reelId);
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

  const avatar = await getSnapshotAvatar(reel);
  return avatar?.kie_character_id || null;
}

async function getSnapshotAvatar(reel: OmniReel) {
  const avatarId = Number((reel.avatar_snapshot as { id?: unknown } | null)?.id);
  if (!Number.isInteger(avatarId) || avatarId <= 0) return null;
  const { rows } = await pool.query<OmniClientAvatar>(
    "SELECT * FROM omni_client_avatars WHERE id = $1 AND project_id = $2 AND reference_url = $3 LIMIT 1",
    [avatarId, reel.project_id, getAvatarReferenceUrl(reel)],
  );
  return rows[0] || null;
}

async function resolveKieAudioIds(reel: OmniReel) {
  const latestAvatar = await getSnapshotAvatar(reel);
  const source = {
    ...(reel.avatar_snapshot || {}),
    latestAvatar,
    data: latestAvatar?.kie_character_payload,
  };
  return {
    // One reel has one narrator. Resolve once before the segment loop and reuse this single profile for every segment/retry.
    audioIds: resolveKieOmniAudioIds(source).slice(0, 1),
    voiceGender: detectKieOmniVoiceGender(source),
  };
}

function getReelGenerationProvider(segments: OmniReelSegment[]) {
  return normalizeOmniGenerationProvider(
    segments.find((segment) => segment.generation_provider)?.generation_provider
  );
}

export async function submitOmniReel(reelId: number, providerInput?: unknown) {
  return withOmniReelExecutionLock(reelId, {
    onLocked: async () => (await getReelBundle(reelId)).reel,
    run: () => submitOmniReelUnlocked(reelId, providerInput),
  });
}

async function submitOmniReelUnlocked(reelId: number, providerInput?: unknown) {
  const { reel, segments } = await getReelBundle(reelId);
  const provider = normalizeOmniGenerationProvider(providerInput ?? getReelGenerationProvider(segments));
  const directorBrief = extractDirectorBriefFromSnapshot(reel.source_snapshot);
  const savedSceneMode = reel.creative_strategy && "referenceSceneMode" in reel.creative_strategy
    ? normalizeReferenceSceneMode(reel.creative_strategy.referenceSceneMode) : null;
  const referenceSceneMode = savedSceneMode || resolveReferenceSceneMode(directorBrief || reel.creative_strategy);
  const avatarFreeReferenceScene = isAvatarFreeReferenceScene(referenceSceneMode);
  const referenceFormatMode = resolveReferenceFormatMode(
    directorBrief || reel.source_snapshot
  );
  const montageReference = isVoiceoverMontageReference(referenceFormatMode);
  const continuityChainEnabled = isOmniContinuityChainEnabled();
  const providerContinuityEnabled = continuityChainEnabled && !montageReference;
  if (!segments.length) throw new Error("Omni reel has no segments");
  const missingStoryboardSegments = segments
    .filter((segment) => segment.status !== "completed" && !segment.storyboard_reference_url?.trim())
    .map((segment) => segment.segment_index);
  if (missingStoryboardSegments.length) {
    const message =
      `Storyboard images are required before video creation. Missing segments: ${missingStoryboardSegments.join(", ")}`;
    await markOmniReelPreflightFailure({ reelId: reel.id, provider, message });
    throw new Error(message);
  }
  const avatarReferenceUrl = avatarFreeReferenceScene ? null : getAvatarReferenceUrl(reel);
  const productReferenceUrls = getProductReferenceUrls(reel);
  const productReferenceUrl = productReferenceUrls[0] || null;
  const avatarCharacterId = avatarFreeReferenceScene ? null : await resolveAvatarCharacterId(reel);
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
  if (provider === "kie-ai" && !avatarCharacterId && !avatarFreeReferenceScene) {
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

  for (const segment of segments) {
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
    if (providerContinuityEnabled && segment.segment_index > 1 && !continuity.image) {
      throw new Error(`Segment ${segment.segment_index} cannot start without the previous final-frame continuity reference`);
    }
    const productIsVisible = hasProductVisibleStoryboardFrame(segment.storyboard_plan, productName);
    const continuityImages = continuity.image ? [continuity.image] : [];
    const storyboardImages = segment.storyboard_reference_url
      ? [{ url: segment.storyboard_reference_url, fieldName: referenceImageField, role: "storyboard" }]
      : [];
    const canonicalStoryboardImages = !montageReference && segment.segment_index > 1
      ? canonicalStoryboardReference
      : [];
    const selectedReferenceImages = selectReferenceImagesForSegment({
      provider,
      continuityImages,
      cometReferenceImages: [...storyboardImages, ...canonicalStoryboardImages, ...cometReferenceImages],
      kieReferenceImages: [...storyboardImages, ...canonicalStoryboardImages, ...kieReferenceImages],
      referenceImageTransport,
      segmentIndex: segment.segment_index,
      productIsVisible,
    });
    const continuityPrompt = continuity.image
      ? appendContinuityPromptContract(segment.prompt, {
        wardrobeContinuity: directorBrief?.wardrobe_continuity || "unknown",
      })
      : segment.prompt;
    const kieStoryboardPrompt = applyOmniStoryboardFileReference(
      continuityPrompt,
      selectedReferenceImages.sent
    );
    const providerPrompt =
      provider === "kie-ai"
        ? appendKieReferenceOrderPrompt(kieStoryboardPrompt, selectedReferenceImages.sent, referenceFormatMode)
        : continuityPrompt;
    const finalProviderPrompt = providerPrompt;
    assertReferenceScenePromptContract(finalProviderPrompt, referenceSceneMode);
    const usesStoryboardReference = selectedReferenceImages.sent.some((image) => image.role === "storyboard");
    const videoCharacterId = provider === "kie-ai" && !avatarFreeReferenceScene ? avatarCharacterId : null;
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
      provider_prompt: finalProviderPrompt,
      image_urls: selectedReferenceImages.sent.map((image) => image.url),
      ...(provider === "kie-ai" && videoCharacterId ? { character_ids: [videoCharacterId] } : {}),
      audio_ids: provider === "kie-ai" ? kieAudioIds : [],
      audio_voice_gender: provider === "kie-ai" ? kieVoiceGender : null,
      reference_images_sent: selectedReferenceImages.sent.length > 0,
      reference_image_field: selectedReferenceImages.sent.length ? referenceImageField : null,
      reference_image_transport:
        selectedReferenceImages.sent.length && provider === "cometapi" ? referenceImageTransport : "url",
      reference_images: selectedReferenceImages.sent.map((image, index) => ({
        role: image.role,
        url: image.url,
        file_reference: provider === "kie-ai" ? `@file${index + 1}` : null,
      })),
      reference_images_skipped: selectedReferenceImages.skipped.map((image) => ({
        role: image.role,
        url: image.url,
        reason: getSkippedReferenceReason({
          role: image.role,
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
          ? ["kie_reference_order_v1"]
          : []),
        ...(provider === "kie-ai" && usesStoryboardReference ? ["kie_storyboard_visual_authority_v1"] : []),
      ],
      creative_plan: segment.creative_plan,
      reference_segment_plan: segment.reference_segment_plan || null,
      storyboard_plan: segment.storyboard_plan,
      storyboard_validation: segment.storyboard_validation,
      prompt_validation: segment.prompt_validation,
    };

    let task: ProviderTask;
    try {
      task = await createOmniVideoTask({
        provider,
        avatarFreeReferenceScene,
        prompt: finalProviderPrompt,
        durationSeconds: segment.duration_seconds || 10,
        resolution: requestPayload.resolution,
        referenceImages: selectedReferenceImages.sent,
        imageUrls: selectedReferenceImages.sent.map((image) => image.url),
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

    if (provider === "kie-ai") {
      await recordKieGenerationCost({
        projectId: reel.project_id,
        productId: reel.product_id,
        generatedScriptId: reel.source_generated_script_id,
        reelId: reel.id,
        reelSegmentId: segment.id,
        operation: "video",
        taskId: task.id,
        status: task.status,
        model: requestPayload.model,
        raw: task.raw,
      }).catch((error) => console.error("KIE video cost record failed:", error));
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

  const updated = await getReelBundle(reelId);
  return updated.reel;
}

export async function syncOmniReel(reelId: number) {
  const { reel, segments } = await getReelBundle(reelId);
  await syncOmniReelSegments({ reel, segments });

  const updated = await getReelBundle(reelId);
  const hasFailed = updated.segments.some((segment) => segment.status === "failed");
  const allCompleted = updated.segments.length > 0 && updated.segments.every((segment) => segment.status === "completed");
  const hasPendingDraft = updated.segments.some(
    (segment) => !segment.kie_task_id && segment.status !== "completed" && segment.status !== "failed"
  );

  let stitchedNow = false;
  if (hasFailed) {
    await pool.query(
      "UPDATE omni_reels SET status = 'failed', error_message = 'One or more segments failed', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [reelId]
    );
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

  return getReelBundle(reelId);
}
