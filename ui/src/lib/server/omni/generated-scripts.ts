import pool from "@/lib/db";
import { normalizeAudioMood } from "@/lib/audio-library/moods";
import { extractOpenRouterCostSummaryFromSnapshot, summarizeOpenRouterUsage } from "@/lib/omni/openrouter-cost";
import type { OmniGeneratedScript, OmniPromptPreviewSegment } from "@/lib/omni/types";
import { ensureOmniSchema } from "./schema";
import { getLatestOmniClientAvatar } from "./avatars";
import { shouldAnalyzeDirectorReference } from "./director-analysis-policy";
import { ensureDirectorAnalysis } from "./director-analyses";
import { resolveGeneratedScriptSource } from "./generated-script-source";
import { buildOmniSegmentPrompts } from "./omni-prompt-builder";
import { requireOmniProductInProject } from "./products";
import { getOmniProject } from "./projects";
import { listRecentLifeFormatIds } from "./omni-creative-history";
import { OMNI_SEGMENT_SECONDS, planOmniReelSegments } from "./omni-duration-planner";
import { ensureOmniScriptCta } from "./omni-cta-contract";
import { generateScript } from "./script-generator";
import { resolveReadyGeneratedScriptReference } from "./generated-script-reference-selection";
import { resolveOmniDurationRange } from "./omni-duration-settings";
import { ensureGeneratedScriptStoryboardUrls } from "./generated-script-storyboard-previews";
import type { OmniGenerationProvider } from "@/lib/omni/provider";
import { resolveProductReferenceImageUrls } from "./omni-product-reference-images";
import { extractDirectorReferenceImageUrls } from "./director-reference-images";
import { prepareSegmentStoryboardDirectorReferenceUrls } from "./storyboard-director-references";
import { requireAvatarSpeechGender } from "../../omni/avatar-speech-gender";
import { extractDirectorBriefFromSnapshot } from "./director-analysis-types";
import { isCollagePictureInPictureReference } from "./director-layout-contract";
import { STORYBOARD_PIP_REFERENCE_FRAMES_PER_SEGMENT } from "./storyboard-reference-frame-timing";
import { assertPhysicalPromptPlan } from "./physical-scene-validator";
import {
  normalizeOmniPromptPlanWithPhysicalRules,
  repairOmniPromptPlanWithAi,
} from "./omni-physical-repair-pipeline";

const PROMPT_REPAIR_TIMEOUT_MS = 15_000;

function normalizeScript(row: OmniGeneratedScript): OmniGeneratedScript {
  return {
    ...row,
    source_legacy_scenario_id:
      row.source_legacy_scenario_id === null ? null : Number(row.source_legacy_scenario_id),
    source_legacy_client_id:
      row.source_legacy_client_id === null ? null : Number(row.source_legacy_client_id),
    director_analysis_id: row.director_analysis_id === null ? null : Number(row.director_analysis_id),
    background_audio_mood: normalizeAudioMood(row.background_audio_mood),
  };
}

export async function listGeneratedScripts(projectId: number, productId?: number | null) {
  await ensureOmniSchema();
  const values: unknown[] = [projectId];
  const clauses = ["project_id = $1"];

  if (productId) {
    values.push(productId);
    clauses.push(`product_id = $${values.length}`);
  }

  const { rows } = await pool.query<OmniGeneratedScript>(
    `SELECT *
     FROM omni_generated_scripts
     WHERE ${clauses.join(" AND ")}
     ORDER BY created_at DESC, id DESC
     LIMIT 50`,
    values
  );
  return rows.map(normalizeScript);
}

export async function getGeneratedScript(input: { projectId: number; productId: number; scriptId: number }) {
  await ensureOmniSchema();
  const { rows } = await pool.query<OmniGeneratedScript>(
    `SELECT *
     FROM omni_generated_scripts
     WHERE id = $1
       AND project_id = $2
       AND product_id = $3
       AND status <> 'archived'
     LIMIT 1`,
    [input.scriptId, input.projectId, input.productId]
  );
  return rows[0] ? normalizeScript(rows[0]) : null;
}

export async function buildGeneratedScriptPromptPreview(input: {
  projectId: number;
  productId: number;
  scriptId: number;
  generationProvider?: OmniGenerationProvider;
}): Promise<OmniPromptPreviewSegment[]> {
  const generatedScript = await getGeneratedScript(input);
  if (!generatedScript) throw new Error("Generated script not found for this product");

  const product = await requireOmniProductInProject(input.projectId, input.productId);
  const resolvedGeneratedScript = {
    ...generatedScript,
    script: ensureOmniScriptCta(generatedScript.script, product.cta_mode, product.cta_value),
  };
  const avatar = await getLatestOmniClientAvatar(input.projectId);
  const project = await getOmniProject(input.projectId);
  if (!project) throw new Error("Omni client project not found");
  const durationRange = await resolveOmniDurationRange({ project, product });
  const segmentPlan = planOmniReelSegments(resolvedGeneratedScript.script, { durationRange });
  const recentFormatIds = await listRecentLifeFormatIds(input.projectId, input.productId);
  const directorBrief = extractDirectorBriefFromSnapshot(resolvedGeneratedScript.source_snapshot);
  const basePromptPlan = buildOmniSegmentPrompts({
    generatedScript: resolvedGeneratedScript,
    legacyTranscript: null,
    product,
    avatar,
    segmentCount: segmentPlan.segmentCount,
    segmentSeconds: OMNI_SEGMENT_SECONDS,
    voiceSegments: segmentPlan.segments,
    segmentDurationsSeconds: segmentPlan.segmentDurationsSeconds,
    brief: null,
    targetAudience: project.target_audience,
    ctaMode: product.cta_mode,
    ctaValue: product.cta_value,
    recentFormatIds,
    wardrobeSource: project.wardrobe_source,
    directorBrief,
  });
  const promptRepairPromise = repairOmniPromptPlanWithAi({
    promptPlan: basePromptPlan,
    productName: product.name,
    productPhysicalContract: product.product_physical_contract,
    segmentCount: segmentPlan.segmentCount,
    directorBrief,
  });
  const promptPlan = await withTimeout(
    promptRepairPromise,
    PROMPT_REPAIR_TIMEOUT_MS,
    () => normalizeOmniPromptPlanWithPhysicalRules({
      promptPlan: basePromptPlan,
      productName: product.name,
      productPhysicalContract: product.product_physical_contract,
      segmentCount: segmentPlan.segmentCount,
      directorBrief,
    })
  );
  assertPhysicalPromptPlan(promptPlan);
  const storyboardGeneration = prepareSegmentStoryboardDirectorReferenceUrls({
    sourceSnapshot: resolvedGeneratedScript.source_snapshot,
    storageTarget: {
      kind: "generated_script",
      projectId: input.projectId,
      scriptId: input.scriptId,
    },
    framesPerSegment: isCollagePictureInPictureReference(directorBrief)
      ? STORYBOARD_PIP_REFERENCE_FRAMES_PER_SEGMENT
      : undefined,
    segments: promptPlan.map((segment) => ({
      index: segment.index,
      durationSeconds: segment.durationSeconds,
      wordCount: segmentPlan.segments[segment.index - 1]?.wordCount,
    })),
  }).then((directorReferenceImageUrlsBySegment) => ensureGeneratedScriptStoryboardUrls({
    ...input,
    productName: product.name,
    productPhysicalContract: product.product_physical_contract,
    avatarReferenceUrl: avatar?.reference_url || null,
    productReferenceUrls: resolveProductReferenceImageUrls(product),
    directorReferenceImageUrlsBySegment,
    directorBrief,
    promptPlan,
    generationProvider: input.generationProvider,
  }));
  void storyboardGeneration.catch((error) => {
    console.warn("Generated script storyboard background job failed:", {
      scriptId: input.scriptId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
  const storyboardUrls = new Map<number, string>();

  return promptPlan.map((segment) => ({
    segmentIndex: segment.index,
    durationSeconds: segment.durationSeconds,
    role: segment.role,
    prompt: segment.prompt,
    referenceUrl: segment.referenceUrl,
    voiceoverText: segment.voiceoverText,
    creativeStrategy: segment.creativeStrategy,
    creativePlan: segment.creativePlan,
    storyboardPlan: segment.storyboardPlan,
    storyboardValidation: segment.storyboardValidation,
    storyboardReferenceUrl: storyboardUrls.get(segment.index) || null,
    validation: segment.validation,
  }));
}

export async function createGeneratedScriptFromLegacy(input: {
  projectId: number;
  productId: number;
  legacyScenarioId?: number | null;
}) {
  await ensureOmniSchema();
  const project = await getOmniProject(input.projectId);
  if (!project) throw new Error("Omni client project not found");

  const product = await requireOmniProductInProject(input.projectId, input.productId);
  const avatar = await getLatestOmniClientAvatar(input.projectId);
  const avatarSpeechGender = requireAvatarSpeechGender(avatar?.speech_gender);
  const durationRange = await resolveOmniDurationRange({ project, product });
  const { sourceScenario, sourceMode, directorAnalysis } = await resolveReadyGeneratedScriptReference({
    ...input,
    resolveSource: resolveGeneratedScriptSource,
    shouldAnalyze: shouldAnalyzeDirectorReference,
    ensureAnalysis: ensureDirectorAnalysis,
    warn: (message) => console.warn(message),
  });
  const directorBrief =
    directorAnalysis?.director_analysis_status === "completed" ? directorAnalysis.director_analysis_json : null;
  const directorReferenceImageUrls = extractDirectorReferenceImageUrls({ directorAnalysis });

  const model = process.env.SCENARIO_MODEL || "google/gemini-2.5-flash";
  const generated = await generateScript({
    model,
    projectName: project.name,
    targetAudience: project.target_audience,
    brandVoice: project.brand_voice,
    productName: product.name,
    productDescription: product.description,
    productReferenceNotes: product.product_reference_notes,
    ctaMode: product.cta_mode,
    ctaValue: product.cta_value,
    sourceScenario,
    directorBrief,
    wardrobeSource: project.wardrobe_source,
    durationRange,
    avatarSpeechGender,
  });
  const directorCost = extractOpenRouterCostSummaryFromSnapshot(directorAnalysis?.source_snapshot);
  const openRouterUsage = [...(directorCost?.layers || []), ...generated.openRouterUsage];
  const openRouterCost = summarizeOpenRouterUsage(openRouterUsage);

  const sourceSnapshot = {
    id: sourceScenario.id,
    source_selection_mode: sourceMode,
    legacy_client_id: sourceScenario.client_id,
    legacy_client_name: sourceScenario.legacy_client_name,
    legacy_product_keyword: sourceScenario.legacy_product_keyword,
    title: sourceScenario.title,
    topic: sourceScenario.topic,
    source_kind: "legacy_reference_transcript",
    transcript: sourceScenario.script,
    reels_url: sourceScenario.reels_url,
    word_count: sourceScenario.word_count,
    duration_seconds: sourceScenario.duration_seconds,
    source_reference: sourceScenario.source_reference,
    quality_check: generated.qualityCheck,
    openrouter_usage: openRouterUsage,
    openrouter_cost: openRouterCost,
    director_analysis_id: directorAnalysis?.id || null,
    background_audio_mood: normalizeAudioMood(generated.payload.background_audio_mood),
    director_analysis_status: directorAnalysis?.director_analysis_status || "not_requested",
    director_analysis: directorBrief,
    director_video_url: directorAnalysis?.stored_video_url || directorAnalysis?.resolved_video_url || null,
    director_reference_image_urls: directorReferenceImageUrls,
    wardrobe_source: project.wardrobe_source,
    avatar_speech_gender: avatarSpeechGender,
    director_analysis_model: directorAnalysis?.analysis_model || null,
    director_analysis_prompt_version: directorAnalysis?.analysis_prompt_version || null,
    director_analysis_error: directorAnalysis?.analysis_error || null,
    llm_prompt_chain: generated.llmPromptChainSnapshot || null,
    generated_script_plan_version: "reels-script-writer-v1",
    duration_range: durationRange,
    generated_script_plan: {
      hook_options: generated.payload.hook_options,
      selected_hook: generated.payload.selected_hook,
      beats: generated.payload.beats.map((beat) => ({
        stage: beat.stage,
        visual_cue: beat.visualCue,
        voiceover: beat.voiceover,
      })),
    },
  };
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
    product_refs: product.product_refs,
  };

  const { rows } = await pool.query<OmniGeneratedScript>(
    `INSERT INTO omni_generated_scripts (
       project_id,
       product_id,
       source_legacy_scenario_id,
       source_legacy_client_id,
       director_analysis_id,
       title,
       hook,
       script,
       caption,
       cta_keyword,
       lead_magnet,
       background_audio_mood,
       source_snapshot,
       product_snapshot,
       model,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15, CURRENT_TIMESTAMP)
     RETURNING *`,
    [
      input.projectId,
      input.productId,
      sourceScenario.id,
      sourceScenario.client_id,
      directorAnalysis?.id || null,
      generated.payload.title || null,
      generated.payload.hook || null,
      generated.payload.script || "",
      generated.payload.caption || null,
      generated.payload.cta_keyword || null,
      generated.payload.lead_magnet || null,
      normalizeAudioMood(generated.payload.background_audio_mood),
      JSON.stringify(sourceSnapshot),
      JSON.stringify(productSnapshot),
      model,
    ]
  );

  return normalizeScript(rows[0]);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: () => T) {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback()), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback());
      },
    );
  });
}
