import pool from "@/lib/db";
import { normalizeAudioMood } from "@/lib/audio-library/moods";
import { normalizeDirectorAudioProfile } from "@/lib/omni/director-audio-profile";
import { OmniReel, OmniReelSegment } from "@/lib/omni/types";
import { ensureOmniSchema } from "./schema";
import { getLatestOmniClientAvatar } from "./avatars";
import { ensureDirectorAnalysis, getDirectorAnalysisForLegacy } from "./director-analyses";
import { shouldAnalyzeDirectorReference } from "./director-analysis-policy";
import { getGeneratedScript } from "./generated-scripts";
import { assertGeneratedScriptReady } from "./generated-script-readiness";
import { getLegacyScenario } from "./legacy-scenarios";
import { prepareOmniPromptPlan } from "./omni-prompt-preparation";
import { adaptDirectorBriefForAvatarReel } from "./omni-avatar-reel-plan";
import { requireOmniProductInProject } from "./products";
import { getOmniProject } from "./projects";
import { listRecentLifeFormatIds } from "./omni-creative-history";
import { OMNI_SEGMENT_SECONDS } from "./omni-duration-planner";
import { resolveOmniTimedVoiceoverPlan } from "./omni-timed-voiceover-plan";
import { resolveOmniDurationRange } from "./omni-duration-settings";
import {
  ensureGeneratedScriptStoryboardUrls,
} from "./generated-script-storyboard-previews";
import { resolveProductReferenceImageUrls } from "./omni-product-reference-images";
import { detectKieOmniVoiceGender } from "./kie-omni-audio";
import { extractDirectorReferenceImageUrls } from "./director-reference-images";
import { prepareSegmentStoryboardDirectorReferenceUrls } from "./storyboard-director-references";
import { normalizeOmniGenerationProvider, type OmniGenerationProvider } from "@/lib/omni/provider";
import {
  extractDirectorBriefFromSnapshot,
  normalizeDirectorBrief,
} from "./director-analysis-types";
import { resolveReferenceSceneMode } from "./omni-reference-scene-mode";
import { resolveOmniAvatarContext } from "./omni-avatar-context";
import { resolveReferenceFormatMode } from "./omni-reference-format-mode";
import { isCollagePictureInPictureReference } from "./director-layout-contract";
import { readSourceDurationSeconds, STORYBOARD_PIP_REFERENCE_FRAMES_PER_SEGMENT } from "./storyboard-reference-frame-timing";
import { buildReferenceTransferPolicy } from "./omni-reference-transfer-policy";
import { generateStoryboardReferenceUrls, reserveOmniReelId } from "./omni-reel-storyboard-generator";
import { resolveReferenceFrameCount } from "./reference-segment-plan";

function normalizeReel(row: OmniReel): OmniReel {
  return {
    ...row,
    source_generated_script_id:
      row.source_generated_script_id === null ? null : Number(row.source_generated_script_id),
    source_legacy_scenario_id:
      row.source_legacy_scenario_id === null ? null : Number(row.source_legacy_scenario_id),
    reference_audio_profile: normalizeDirectorAudioProfile(row.reference_audio_profile) || null,
    background_audio_mood: row.background_audio_mood ? normalizeAudioMood(row.background_audio_mood) : null,
    background_audio_track_id:
      row.background_audio_track_id === null || row.background_audio_track_id === undefined
        ? null
        : Number(row.background_audio_track_id),
  };
}

export async function listOmniReels(projectId: number, productId?: number | null) {
  await ensureOmniSchema();
  const values: unknown[] = [projectId];
  const clauses = ["project_id = $1"];
  if (productId) {
    values.push(productId);
    clauses.push(`product_id = $${values.length}`);
  }

  const { rows } = await pool.query<OmniReel>(
    `SELECT *
     FROM omni_reels
     WHERE ${clauses.join(" AND ")}
     ORDER BY created_at DESC, id DESC
     LIMIT 50`,
    values
  );
  return rows.map(normalizeReel);
}

export async function getOmniReel(reelId: number) {
  await ensureOmniSchema();
  const { rows } = await pool.query<OmniReel>(
    "SELECT * FROM omni_reels WHERE id = $1 LIMIT 1",
    [reelId]
  );
  return rows[0] ? normalizeReel(rows[0]) : null;
}

export async function listOmniReelSegments(reelIds: number[]) {
  await ensureOmniSchema();
  if (!reelIds.length) return [];
  const { rows } = await pool.query<OmniReelSegment>(
    `SELECT *
     FROM omni_reel_segments
     WHERE reel_id = ANY($1::int[])
     ORDER BY reel_id DESC, segment_index ASC`,
    [reelIds]
  );
  return rows;
}

export async function createOmniReel(input: {
  projectId: number;
  productId: number;
  sourceGeneratedScriptId?: number | null;
  sourceLegacyScenarioId?: number | null;
  targetDurationSeconds?: unknown;
  brief?: unknown;
  generationProvider?: OmniGenerationProvider;
}) {
  await ensureOmniSchema();
  const brief = typeof input.brief === "string" && input.brief.trim() ? input.brief.trim() : null;
  const product = await requireOmniProductInProject(input.projectId, input.productId);
  const project = await getOmniProject(input.projectId);
  if (!project) throw new Error("Omni project not found");
  const generatedScript = input.sourceGeneratedScriptId
    ? await getGeneratedScript({
        projectId: input.projectId,
        productId: input.productId,
        scriptId: input.sourceGeneratedScriptId,
      })
    : null;
  if (input.sourceGeneratedScriptId && !generatedScript) {
    throw new Error("Generated script not found for this product");
  }
  const resolvedGeneratedScript = generatedScript;
  if (resolvedGeneratedScript) assertGeneratedScriptReady(resolvedGeneratedScript);
  const sourceLegacyScenarioId = input.sourceLegacyScenarioId || generatedScript?.source_legacy_scenario_id || null;
  const sourceScenario = sourceLegacyScenarioId ? await getLegacyScenario(sourceLegacyScenarioId) : null;
  const sourceScenarioAnalysis = sourceScenario && !generatedScript
    ? shouldAnalyzeDirectorReference(sourceScenario)
      ? await ensureDirectorAnalysis({
          projectId: input.projectId,
          productId: input.productId,
          sourceScenario,
        })
      : await getDirectorAnalysisForLegacy({ legacyScenarioId: sourceScenario.id })
    : null;
  const sourceScenarioDirectorBrief =
    sourceScenarioAnalysis?.director_analysis_status === "completed"
      ? normalizeDirectorBrief(sourceScenarioAnalysis.director_analysis_json)
      : null;
  const directorBrief = adaptDirectorBriefForAvatarReel(
    extractDirectorBriefFromSnapshot(resolvedGeneratedScript?.source_snapshot) || sourceScenarioDirectorBrief,
  );
  const referenceAudioProfile = normalizeDirectorAudioProfile(directorBrief?.audio_profile) || null;
  const referenceTransferPlan = buildReferenceTransferPolicy({
    hasProductReference: product.product_refs.some((reference) => reference.kind === "image"),
    directorBrief,
  });
  const directorReferenceImageUrls = sourceScenarioAnalysis
    ? extractDirectorReferenceImageUrls({ directorAnalysis: sourceScenarioAnalysis })
    : extractDirectorReferenceImageUrls({ sourceSnapshot: resolvedGeneratedScript?.source_snapshot });
  const scriptText = resolvedGeneratedScript?.script || sourceScenario?.script || brief || "";
  const backgroundAudioMood = referenceAudioProfile?.music_present
    ? normalizeAudioMood(referenceAudioProfile.mood)
    : null;
  const durationRange = await resolveOmniDurationRange({
    project,
    product,
    requestTargetDurationSeconds: input.targetDurationSeconds,
    legacyClientId: generatedScript?.source_legacy_client_id ?? sourceScenario?.client_id,
  });
  const timedVoiceoverPlan = resolveOmniTimedVoiceoverPlan({
    script: scriptText,
    sourceSnapshot: resolvedGeneratedScript?.source_snapshot,
    durationRange,
  });
  const targetDuration = timedVoiceoverPlan.durationSeconds;
  const segmentCount = timedVoiceoverPlan.segmentCount;
  const referenceSourceDurationSeconds = readSourceDurationSeconds(resolvedGeneratedScript?.source_snapshot)
    || sourceScenario?.duration_seconds;
  const latestAvatar = await getLatestOmniClientAvatar(input.projectId);
  const avatarContext = resolveOmniAvatarContext({ avatar: latestAvatar, directorBrief });
  const {
    avatarFreeReferenceScene: avatarFreeReferenceSceneFromBrief,
    speechGender: avatarSpeechGender,
  } = avatarContext;
  const sourceSnapshot = resolvedGeneratedScript
    ? {
        source_kind: "generated_script",
        id: resolvedGeneratedScript.id,
        source_legacy_scenario_id: resolvedGeneratedScript.source_legacy_scenario_id,
        source_legacy_client_id: resolvedGeneratedScript.source_legacy_client_id,
        title: resolvedGeneratedScript.title,
        hook: resolvedGeneratedScript.hook,
        script: resolvedGeneratedScript.script,
        source_snapshot: resolvedGeneratedScript.source_snapshot,
        director_analysis_id: resolvedGeneratedScript.director_analysis_id,
        director_analysis_status: directorBrief ? "completed" : "not_requested",
        director_analysis: directorBrief,
        reference_audio_profile: referenceAudioProfile,
        reference_format_mode: resolveReferenceFormatMode(directorBrief),
        director_video_url: sourceScenarioAnalysis?.stored_video_url || sourceScenarioAnalysis?.resolved_video_url || null,
        director_reference_image_urls: directorReferenceImageUrls,
        reference_transfer_plan: referenceTransferPlan,
        wardrobe_source: project.wardrobe_source,
        timed_voiceover_plan: timedVoiceoverPlan,
      }
    : sourceScenario
      ? {
        source_kind: "legacy_reference_transcript",
        id: sourceScenario.id,
        legacy_client_id: sourceScenario.client_id,
        legacy_client_name: sourceScenario.legacy_client_name,
        legacy_product_keyword: sourceScenario.legacy_product_keyword,
        title: sourceScenario.title,
        topic: sourceScenario.topic,
        transcript: sourceScenario.script,
        duration_seconds: sourceScenario.duration_seconds,
        reels_url: sourceScenario.reels_url,
        source_reference: sourceScenario.source_reference,
        director_analysis_id: sourceScenarioAnalysis?.id || null,
        director_analysis_status: sourceScenarioAnalysis?.director_analysis_status || "not_requested",
        director_analysis: sourceScenarioDirectorBrief,
        reference_audio_profile: referenceAudioProfile,
        reference_format_mode: resolveReferenceFormatMode(directorBrief),
        reference_transfer_plan: referenceTransferPlan,
        director_video_url: sourceScenarioAnalysis?.stored_video_url || sourceScenarioAnalysis?.resolved_video_url || null,
        director_reference_image_urls: directorReferenceImageUrls,
        wardrobe_source: project.wardrobe_source,
        timed_voiceover_plan: timedVoiceoverPlan,
      }
    : null;
  const productSnapshot = {
    id: product.id,
    name: product.name,
    description: product.description,
    product_reference_notes: product.product_reference_notes,
    product_visual_profile: product.product_visual_profile,
    product_visual_profile_status: product.product_visual_profile_status,
    product_visual_profile_model: product.product_visual_profile_model,
    product_visual_profile_updated_at: product.product_visual_profile_updated_at,
    product_physical_contract: product.product_physical_contract,
    product_physical_contract_status: product.product_physical_contract_status,
    product_physical_contract_updated_at: product.product_physical_contract_updated_at,
    target_duration_seconds: product.target_duration_seconds,
    duration_range: durationRange,
    cta_mode: product.cta_mode,
    cta_value: product.cta_value,
    product_refs: product.product_refs,
  };
  const avatarSnapshot = latestAvatar && !avatarFreeReferenceSceneFromBrief
    ? {
        id: latestAvatar.id,
        display_name: latestAvatar.display_name,
        prompt: latestAvatar.prompt,
        reference_url: latestAvatar.reference_url,
        status: latestAvatar.status,
        provider: latestAvatar.provider,
        speech_gender: avatarSpeechGender,
        kie_character_id: latestAvatar.kie_character_id,
        kie_character_status: latestAvatar.kie_character_status,
        voice_gender: detectKieOmniVoiceGender(latestAvatar),
        wardrobe_source: project.wardrobe_source,
      }
    : null;
  const recentFormatIds = await listRecentLifeFormatIds(input.projectId, input.productId);
  const promptPlan = await prepareOmniPromptPlan({
    projectId: input.projectId,
    productId: input.productId,
    generatedScript: resolvedGeneratedScript,
    legacyTranscript: sourceScenario?.script || null,
    product,
    avatar: latestAvatar,
    segmentCount,
    segmentSeconds: OMNI_SEGMENT_SECONDS,
    timedVoiceoverPlan,
    brief,
    directorBrief,
    targetAudience: project.target_audience,
    ctaMode: product.cta_mode,
    ctaValue: product.cta_value,
    recentFormatIds,
    wardrobeSource: project.wardrobe_source,
    referenceSourceDurationSeconds,
  });
  const creativeStrategy = promptPlan[0]?.creativeStrategy || null;
  const referenceSceneMode = resolveReferenceSceneMode(creativeStrategy);
  const reservedReelId = await reserveOmniReelId();
  const storyboardReferenceFrameCountBySegment = new Map<number, number>();
  for (const segment of promptPlan) {
    const frameCount = isCollagePictureInPictureReference(directorBrief)
      ? STORYBOARD_PIP_REFERENCE_FRAMES_PER_SEGMENT
      : segment.referenceSegmentPlan
        ? resolveReferenceFrameCount(
          segment.referenceSegmentPlan.renderMode,
          segment.referenceSegmentPlan.beats.length
        )
        : null;
    if (frameCount) storyboardReferenceFrameCountBySegment.set(segment.index, frameCount);
  }
  const storyboardDirectorReferenceImageUrlsBySegment = await prepareSegmentStoryboardDirectorReferenceUrls({
    directorAnalysis: sourceScenarioAnalysis,
    sourceSnapshot: resolvedGeneratedScript?.source_snapshot || sourceSnapshot,
    storageTarget: {
      kind: "reel",
      projectId: input.projectId,
      reelId: reservedReelId,
    },
    framesPerSegment: isCollagePictureInPictureReference(directorBrief)
      ? STORYBOARD_PIP_REFERENCE_FRAMES_PER_SEGMENT
      : undefined,
    framesPerSegmentBySegment: storyboardReferenceFrameCountBySegment,
    segments: promptPlan.map((segment) => ({
      index: segment.index,
      durationSeconds: segment.durationSeconds,
      wordCount: timedVoiceoverPlan.segments[segment.index - 1]?.wordCount,
    })),
  });
  let storyboardReferenceUrls: (string | null)[];
  if (resolvedGeneratedScript) {
    const generatedStoryboardUrls = await ensureGeneratedScriptStoryboardUrls({
      expectedScript: resolvedGeneratedScript.script,
      projectId: input.projectId,
      productId: input.productId,
      scriptId: resolvedGeneratedScript.id,
      productName: product.name,
      productPhysicalContract: product.product_physical_contract,
      avatarReferenceUrl: avatarFreeReferenceSceneFromBrief ? null : latestAvatar?.reference_url || null,
      productReferenceUrls: resolveProductReferenceImageUrls(product),
      directorReferenceImageUrls,
      directorReferenceImageUrlsBySegment: storyboardDirectorReferenceImageUrlsBySegment,
      directorBrief,
      referenceSceneMode,
      referenceFormatMode: resolveReferenceFormatMode(directorBrief),
      promptPlan: promptPlan.map((segment) => ({
        index: segment.index,
        storyboardPlan: segment.storyboardPlan,
        productRole: segment.creativePlan.productRole,
        referenceSegmentPlan: segment.referenceSegmentPlan,
      })),
      generationProvider: input.generationProvider,
    });
    storyboardReferenceUrls = Array.from(
      { length: segmentCount },
      (_, index) => generatedStoryboardUrls.get(index + 1) || null
    );
  } else {
    storyboardReferenceUrls = await generateStoryboardReferenceUrls({
      projectId: input.projectId,
      productId: input.productId,
      reelId: reservedReelId,
      productName: product.name,
      productPhysicalContract: product.product_physical_contract,
      productReferenceUrls: resolveProductReferenceImageUrls(product),
      directorReferenceImageUrlsBySegment: storyboardDirectorReferenceImageUrlsBySegment,
      directorBrief,
      avatarReferenceUrl: avatarFreeReferenceSceneFromBrief ? null : latestAvatar?.reference_url || null,
      referenceSceneMode,
      promptPlan,
      generationProvider: input.generationProvider,
    });
  }

  const missingStoryboardSegments = promptPlan
    .filter((segment) => !segment.storyboardPlan || !storyboardReferenceUrls[segment.index - 1])
    .map((segment) => segment.index);
  if (missingStoryboardSegments.length) {
    throw new Error(
      `Storyboard images are required before video creation. Missing segments: ${missingStoryboardSegments.join(", ")}`
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reelResult = await client.query<OmniReel>(
      `INSERT INTO omni_reels (
       id,
       project_id,
       product_id,
       source_generated_script_id,
       source_legacy_scenario_id,
         target_duration_seconds,
         segment_count,
         status,
         brief,
         source_snapshot,
         product_snapshot,
         avatar_snapshot,
         creative_strategy,
         prompt_contract_version,
         reference_audio_profile,
         background_audio_mood,
         background_audio_status,
         stitch_status,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14::jsonb, $15, 'not_selected', 'not_ready', CURRENT_TIMESTAMP)
       RETURNING *`,
      [
        reservedReelId,
        input.projectId,
        input.productId,
        generatedScript?.id || input.sourceGeneratedScriptId || null,
        generatedScript?.source_legacy_scenario_id || input.sourceLegacyScenarioId || null,
        targetDuration,
        segmentCount,
        brief,
        JSON.stringify(sourceSnapshot),
        JSON.stringify(productSnapshot),
        JSON.stringify(avatarSnapshot),
        JSON.stringify(creativeStrategy),
        creativeStrategy?.version || null,
        JSON.stringify(referenceAudioProfile),
        backgroundAudioMood,
      ]
    );
    const reel = reelResult.rows[0];

    for (let index = 0; index < segmentCount; index += 1) {
      const segmentPrompt = promptPlan[index];
      await client.query(
        `INSERT INTO omni_reel_segments (
           reel_id,
           segment_index,
           duration_seconds,
           slot_role,
           status,
           prompt,
           reference_url,
           voiceover_text,
           creative_plan,
           reference_segment_plan,
           storyboard_plan,
           storyboard_validation,
           storyboard_reference_url,
           prompt_validation,
           generation_provider
         )
         VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12, $13::jsonb, $14)`,
        [
          reel.id,
          index + 1,
          segmentPrompt.durationSeconds,
          segmentPrompt.role,
          segmentPrompt.prompt,
          segmentPrompt.referenceUrl,
          segmentPrompt.voiceoverText,
          JSON.stringify(segmentPrompt.creativePlan),
          segmentPrompt.referenceSegmentPlan ? JSON.stringify(segmentPrompt.referenceSegmentPlan) : null,
          segmentPrompt.storyboardPlan ? JSON.stringify(segmentPrompt.storyboardPlan) : null,
          segmentPrompt.storyboardValidation ? JSON.stringify(segmentPrompt.storyboardValidation) : null,
          storyboardReferenceUrls[index] || null,
          JSON.stringify(segmentPrompt.validation),
          normalizeOmniGenerationProvider(input.generationProvider),
        ]
      );
    }

    await client.query("COMMIT");
    return normalizeReel(reel);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
