import pool from "@/lib/db";
import { detectAudioMoodFromText, normalizeAudioMood } from "@/lib/audio-library/moods";
import { OmniReel, OmniReelSegment } from "@/lib/omni/types";
import { ensureOmniSchema } from "./schema";
import { getLatestOmniClientAvatar } from "./avatars";
import { ensureDirectorAnalysis, getDirectorAnalysisForLegacy } from "./director-analyses";
import { shouldAnalyzeDirectorReference } from "./director-analysis-policy";
import { getGeneratedScript } from "./generated-scripts";
import { getLegacyScenario } from "./legacy-scenarios";
import { buildOmniSegmentPrompts } from "./omni-prompt-builder";
import { requireOmniProductInProject } from "./products";
import { getOmniProject } from "./projects";
import { listRecentLifeFormatIds } from "./omni-creative-history";
import { OMNI_SEGMENT_SECONDS, planOmniReelSegments } from "./omni-duration-planner";
import { ensureOmniScriptCta } from "./omni-cta-contract";
import { resolveOmniDurationRange } from "./omni-duration-settings";
import { generateStoryboardImage } from "./omni-storyboard-image-generator";
import { ensureGeneratedScriptStoryboardUrls } from "./generated-script-storyboard-previews";
import { resolveProductReferenceImageUrls } from "./omni-product-reference-images";
import { detectKieOmniVoiceGender } from "./kie-omni-audio";
import { extractDirectorReferenceImageUrls } from "./director-reference-images";
import { prepareSegmentStoryboardDirectorReferenceUrls } from "./storyboard-director-references";
import { hasProductVisibleStoryboardFrame } from "./omni-intro-product-contract";
import { requireAvatarSpeechGender } from "../../omni/avatar-speech-gender";
import type { OmniGenerationProvider } from "@/lib/omni/provider";
import {
  extractDirectorBriefFromSnapshot,
  normalizeDirectorBrief,
  type DirectorBrief,
} from "./director-analysis-types";
import { isCollagePictureInPictureReference } from "./director-layout-contract";
import { STORYBOARD_PIP_REFERENCE_FRAMES_PER_SEGMENT } from "./storyboard-reference-frame-timing";
import { assertPhysicalPromptPlan } from "./physical-scene-validator";
import { repairOmniPromptPlanWithAi } from "./omni-physical-repair-pipeline";
import { assertStoryboardPromptContracts } from "./storyboard/storyboard-contract-validator";
import { buildReferenceTransferPolicy } from "./omni-reference-transfer-policy";

function normalizeReel(row: OmniReel): OmniReel {
  return {
    ...row,
    source_generated_script_id:
      row.source_generated_script_id === null ? null : Number(row.source_generated_script_id),
    source_legacy_scenario_id:
      row.source_legacy_scenario_id === null ? null : Number(row.source_legacy_scenario_id),
    background_audio_mood: normalizeAudioMood(row.background_audio_mood),
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
  const resolvedGeneratedScript = generatedScript
    ? {
        ...generatedScript,
        script: ensureOmniScriptCta(generatedScript.script, product.cta_mode, product.cta_value),
      }
    : null;
  const sourceLegacyScenarioId = input.sourceLegacyScenarioId || generatedScript?.source_legacy_scenario_id || null;
  const sourceScenario = sourceLegacyScenarioId ? await getLegacyScenario(sourceLegacyScenarioId) : null;
  const sourceScenarioAnalysis = sourceScenario
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
  const directorBrief = sourceScenarioDirectorBrief ||
    extractDirectorBriefFromSnapshot(resolvedGeneratedScript?.source_snapshot);
  const referenceTransferPlan = buildReferenceTransferPolicy({
    hasProductReference: product.product_refs.some((reference) => reference.kind === "image"),
  });
  const directorReferenceImageUrls = sourceScenarioAnalysis
    ? extractDirectorReferenceImageUrls({ directorAnalysis: sourceScenarioAnalysis })
    : extractDirectorReferenceImageUrls({ sourceSnapshot: resolvedGeneratedScript?.source_snapshot });
  const scriptText = resolvedGeneratedScript?.script || sourceScenario?.script || brief || "";
  const backgroundAudioMood = normalizeAudioMood(
    resolvedGeneratedScript?.background_audio_mood,
    detectAudioMoodFromText(scriptText)
  );
  const durationRange = await resolveOmniDurationRange({
    project,
    product,
    requestTargetDurationSeconds: input.targetDurationSeconds,
  });
  const segmentPlan = planOmniReelSegments(scriptText, { durationRange });
  const targetDuration = segmentPlan.durationSeconds;
  const segmentCount = segmentPlan.segmentCount;
  const latestAvatar = await getLatestOmniClientAvatar(input.projectId);
  const avatarSpeechGender = requireAvatarSpeechGender(latestAvatar?.speech_gender);
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
        director_analysis_id: sourceScenarioAnalysis?.id || null,
        director_analysis_status: sourceScenarioAnalysis?.director_analysis_status || "not_requested",
        director_analysis: sourceScenarioDirectorBrief,
        director_video_url: sourceScenarioAnalysis?.stored_video_url || sourceScenarioAnalysis?.resolved_video_url || null,
        director_reference_image_urls: directorReferenceImageUrls,
        reference_transfer_plan: referenceTransferPlan,
        wardrobe_source: project.wardrobe_source,
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
        reference_transfer_plan: referenceTransferPlan,
        director_video_url: sourceScenarioAnalysis?.stored_video_url || sourceScenarioAnalysis?.resolved_video_url || null,
        director_reference_image_urls: directorReferenceImageUrls,
        wardrobe_source: project.wardrobe_source,
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
  const avatarSnapshot = latestAvatar
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
  const promptPlan = await repairOmniPromptPlanWithAi({
    promptPlan: buildOmniSegmentPrompts({
      generatedScript: resolvedGeneratedScript,
      legacyTranscript: sourceScenario?.script || null,
      product,
      avatar: latestAvatar,
      segmentCount,
      segmentSeconds: OMNI_SEGMENT_SECONDS,
      voiceSegments: segmentPlan.segments,
      segmentDurationsSeconds: segmentPlan.segmentDurationsSeconds,
      brief,
      directorBrief,
      targetAudience: project.target_audience,
      ctaMode: product.cta_mode,
      ctaValue: product.cta_value,
      recentFormatIds,
      wardrobeSource: project.wardrobe_source,
    }),
    productName: product.name,
    productPhysicalContract: product.product_physical_contract,
    segmentCount,
    directorBrief,
  });
  assertPhysicalPromptPlan(promptPlan);
  assertStoryboardPromptContracts(promptPlan, product.name);
  const creativeStrategy = promptPlan[0]?.creativeStrategy || null;
  const reservedReelId = await reserveOmniReelId();
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
    segments: promptPlan.map((segment) => ({
      index: segment.index,
      durationSeconds: segment.durationSeconds,
      wordCount: segmentPlan.segments[segment.index - 1]?.wordCount,
    })),
  });
  let storyboardReferenceUrls: (string | null)[];
  if (resolvedGeneratedScript) {
    const generatedStoryboardUrls = await ensureGeneratedScriptStoryboardUrls({
      projectId: input.projectId,
      productId: input.productId,
      scriptId: resolvedGeneratedScript.id,
      productName: product.name,
      productPhysicalContract: product.product_physical_contract,
      avatarReferenceUrl: latestAvatar?.reference_url || null,
      productReferenceUrls: resolveProductReferenceImageUrls(product),
      directorReferenceImageUrls,
      directorReferenceImageUrlsBySegment: storyboardDirectorReferenceImageUrlsBySegment,
      directorBrief,
      promptPlan: promptPlan.map((segment) => ({
        index: segment.index,
        storyboardPlan: segment.storyboardPlan,
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
      avatarReferenceUrl: latestAvatar?.reference_url || null,
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
         background_audio_mood,
         background_audio_status,
         stitch_status,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14, 'not_selected', 'not_ready', CURRENT_TIMESTAMP)
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
           storyboard_plan,
           storyboard_validation,
           storyboard_reference_url,
           prompt_validation
         )
         VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12::jsonb)`,
        [
          reel.id,
          index + 1,
          segmentPrompt.durationSeconds,
          segmentPrompt.role,
          segmentPrompt.prompt,
          segmentPrompt.referenceUrl,
          segmentPrompt.voiceoverText,
          JSON.stringify(segmentPrompt.creativePlan),
          segmentPrompt.storyboardPlan ? JSON.stringify(segmentPrompt.storyboardPlan) : null,
          segmentPrompt.storyboardValidation ? JSON.stringify(segmentPrompt.storyboardValidation) : null,
          storyboardReferenceUrls[index] || null,
          JSON.stringify(segmentPrompt.validation),
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

async function reserveOmniReelId() {
  const { rows } = await pool.query<{ id: number }>(
    "SELECT nextval(pg_get_serial_sequence('omni_reels', 'id'))::int AS id"
  );
  const id = Number(rows[0]?.id);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Could not reserve Omni reel id");
  return id;
}

async function generateStoryboardReferenceUrls(input: {
  projectId: number;
  productId: number;
  reelId: number;
  productName: string;
  productPhysicalContract?: string | null;
  productReferenceUrls: readonly string[];
  directorReferenceImageUrlsBySegment?: ReadonlyMap<number, readonly string[]>;
  directorBrief?: DirectorBrief | null;
  avatarReferenceUrl: string | null;
  promptPlan: readonly ReturnType<typeof buildOmniSegmentPrompts>[number][];
  generationProvider?: OmniGenerationProvider;
}): Promise<(string | null)[]> {
  const urls: (string | null)[] = [];
  let canonicalStoryboardReferenceUrl: string | null = null;
  for (let index = 0; index < input.promptPlan.length; index += 1) {
    const segmentPrompt = input.promptPlan[index];
    if (index > 0 && !canonicalStoryboardReferenceUrl) {
      throw new Error("Storyboard 1 must be approved before generating later storyboard segments");
    }
    const storyboardReferenceUrl: string | null = segmentPrompt.storyboardPlan
      ? await generateStoryboardImage({
        projectId: input.projectId,
        productId: input.productId,
        reelId: input.reelId,
        segmentIndex: index + 1,
        storyboard: segmentPrompt.storyboardPlan,
        productName: input.productName,
        productPhysicalContract: input.productPhysicalContract,
        productReferenceUrls: hasProductVisibleStoryboardFrame(segmentPrompt.storyboardPlan, input.productName)
          ? input.productReferenceUrls
          : [],
        directorReferenceImageUrls: Array.from(input.directorReferenceImageUrlsBySegment?.get(segmentPrompt.index) || []),
        avatarReferenceUrl: input.avatarReferenceUrl,
        canonicalStoryboardReferenceUrl,
        directorBrief: input.directorBrief,
        generationProvider: input.generationProvider,
      })
      : null;
    urls.push(storyboardReferenceUrl);
    if (index === 0 && storyboardReferenceUrl) canonicalStoryboardReferenceUrl = storyboardReferenceUrl;
  }
  return urls;
}
