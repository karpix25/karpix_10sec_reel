import pool from "@/lib/db";
import { normalizeAudioMood } from "@/lib/audio-library/moods";
import { extractOpenRouterCostSummaryFromSnapshot, summarizeOpenRouterUsage } from "@/lib/omni/openrouter-cost";
import type { OmniAutomationJobSummary, OmniGeneratedScript } from "@/lib/omni/types";
import { ensureOmniSchema } from "./schema";
import { getGeneratedScriptCostSummaries } from "./omni-generation-costs";
import { getLatestOmniClientAvatar } from "./avatars";
import { shouldAnalyzeDirectorReference } from "./director-analysis-policy";
import { ensureDirectorAnalysis } from "./director-analyses";
import { advanceGeneratedScriptSourceCursor, resolveGeneratedScriptSource } from "./generated-script-source";
import { requireOmniProductInProject } from "./products";
import { getOmniProject } from "./projects";
import {
  buildOmniTimedVoiceoverPlan,
} from "./omni-timed-voiceover-plan";
import { generateScript } from "./script-generator";
import {
  createGeneratedScriptGenerationRecord,
  failStaleGeneratedScriptGenerations,
  failGeneratedScriptGeneration,
} from "./generated-script-generation-state";
import { resolveReadyGeneratedScriptReference } from "./generated-script-reference-selection";
import { resolveOmniDurationRange } from "./omni-duration-settings";
import { extractDirectorReferenceImageUrls } from "./director-reference-images";
import { resolveNarratorSpeechGender } from "../../omni/avatar-speech-gender";
import { normalizeDirectorBrief } from "./director-analysis-types";
import { isAvatarFreeReferenceScene, resolveReferenceSceneMode } from "./omni-reference-scene-mode";
import { resolveReferenceFormatMode } from "./omni-reference-format-mode";
import { buildReferenceTransferPolicy } from "./omni-reference-transfer-policy";
import {
  buildWriterOwnedScriptContentContract,
} from "./script-content-contract";
import { resolveGeneratedScriptReferenceTranscript } from "./generated-script-reference-transcript";
import { adaptDirectorBriefForAvatarReel } from "./omni-avatar-reel-plan";
import { resolveProductReferenceImageUrls } from "./omni-product-reference-images";


function normalizeScript(row: OmniGeneratedScript & { prepared_prompt_plan?: unknown }): OmniGeneratedScript {
  const script = { ...row };
  delete script.prepared_prompt_plan;
  return {
    ...script,
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
  await failStaleGeneratedScriptGenerations(projectId, productId);
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
  const scripts = rows.map(normalizeScript);
  const costSummaries = await getGeneratedScriptCostSummaries(scripts);
  const automationJobs = await getLatestAutomationJobsByScriptId(scripts.map((script) => script.id));
  return scripts.map((script) => ({
    ...script,
    generation_cost_summary: costSummaries.get(script.id) || null,
    automation_job: automationJobs.get(script.id) || null,
  }));
}

async function getLatestAutomationJobsByScriptId(scriptIds: readonly number[]) {
  if (!scriptIds.length) return new Map<number, OmniAutomationJobSummary>();
  const { rows } = await pool.query<OmniAutomationJobSummary & { generated_script_id: number }>(
    `SELECT DISTINCT ON (generated_script_id)
       generated_script_id,
       status,
       current_stage,
       attempt_count,
       max_attempts,
       last_error,
       updated_at
     FROM omni_automation_jobs
     WHERE generated_script_id = ANY($1::int[])
     ORDER BY generated_script_id, updated_at DESC, id DESC`,
    [scriptIds]
  );
  return new Map(rows.map((job) => [Number(job.generated_script_id), job]));
}

export async function getGeneratedScript(input: { projectId: number; productId: number; scriptId: number }) {
  await ensureOmniSchema();
  const { rows } = await pool.query<OmniGeneratedScript>(
    `SELECT *
     FROM omni_generated_scripts
     WHERE id = $1
       AND project_id = $2
       AND product_id = $3
       AND status IN ('draft', 'approved')
     LIMIT 1`,
    [input.scriptId, input.projectId, input.productId]
  );
  return rows[0] ? normalizeScript(rows[0]) : null;
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
  if (!avatar?.reference_url) throw new Error("Для разговорного ролика нужен сохранённый аватар с изображением.");
  if (!resolveProductReferenceImageUrls(product).length) throw new Error("Добавьте изображение продукта для товарных B-roll.");
  const { sourceScenario, sourceMode, directorAnalysis } = await resolveReadyGeneratedScriptReference({
    ...input,
    resolveSource: resolveGeneratedScriptSource,
    onSourceAttempted: (sourceScenario) => advanceGeneratedScriptSourceCursor({
      projectId: input.projectId,
      productId: input.productId,
      legacyScenarioId: sourceScenario.id,
    }),
    shouldAnalyze: shouldAnalyzeDirectorReference,
    ensureAnalysis: ensureDirectorAnalysis,
    requireCompleteTimeline: true,
    warn: (message) => console.warn(message),
  });
  const durationRange = await resolveOmniDurationRange({
    project,
    product,
    legacyClientId: sourceScenario.client_id,
  });
  const directorBrief = adaptDirectorBriefForAvatarReel(
    directorAnalysis?.director_analysis_status === "completed"
      ? normalizeDirectorBrief(directorAnalysis.director_analysis_json)
      : null);
  const avatarSpeechGender = resolveNarratorSpeechGender(
    avatar?.speech_gender,
    isAvatarFreeReferenceScene(resolveReferenceSceneMode(directorBrief))
  );
  const directorReferenceImageUrls = extractDirectorReferenceImageUrls({ directorAnalysis });
  const referenceTransferPlan = buildReferenceTransferPolicy({
    hasProductReference: product.product_refs.some((reference) => reference.kind === "image"),
    directorBrief,
  });
  const referenceTranscript = resolveGeneratedScriptReferenceTranscript(
    sourceScenario,
    directorAnalysis?.source_snapshot,
  );
  const sourceSnapshotBase = {
    id: sourceScenario.id,
    source_selection_mode: sourceMode,
    legacy_client_id: sourceScenario.client_id,
    legacy_client_name: sourceScenario.legacy_client_name,
    legacy_product_keyword: sourceScenario.legacy_product_keyword,
    title: sourceScenario.title,
    topic: sourceScenario.topic,
    source_kind: "legacy_reference_transcript",
    transcript: referenceTranscript,
    reels_url: sourceScenario.reels_url,
    word_count: sourceScenario.word_count,
    duration_seconds: sourceScenario.duration_seconds,
    source_reference: sourceScenario.source_reference,
    director_analysis_id: directorAnalysis?.id || null,
    director_analysis_status: directorAnalysis?.director_analysis_status || "not_requested",
    director_analysis: directorBrief,
    reference_format_mode: resolveReferenceFormatMode(directorBrief),
    reference_transfer_plan: referenceTransferPlan,
    director_video_url: directorAnalysis?.stored_video_url || directorAnalysis?.resolved_video_url || null,
    director_reference_image_urls: directorReferenceImageUrls,
    wardrobe_source: project.wardrobe_source,
    avatar_speech_gender: avatarSpeechGender,
    director_analysis_model: directorAnalysis?.analysis_model || null,
    director_analysis_prompt_version: directorAnalysis?.analysis_prompt_version || null,
    director_analysis_error: directorAnalysis?.analysis_error || null,
    generated_script_plan_version: "reels-script-writer-v2-writer-owned-adaptation",
    duration_range: durationRange,
    script_adaptation_mode: "writer_owned",
  };
  const model = process.env.SCENARIO_MODEL || "google/gemini-3.5-flash-lite";
  const pendingScript = await createGeneratedScriptGenerationRecord({
    projectId: input.projectId,
    productId: input.productId,
    sourceLegacyScenarioId: sourceScenario.id,
    sourceLegacyClientId: sourceScenario.client_id,
    directorAnalysisId: directorAnalysis?.id || null,
    title: sourceScenario.title || null,
    sourceSnapshot: sourceSnapshotBase,
    productSnapshot: { id: product.id, name: product.name },
    model,
  });
  const writerContentContext = buildWriterOwnedScriptContentContract(referenceTranscript);
  let generated: Awaited<ReturnType<typeof generateScript>>;
  let timedVoiceoverPlan: ReturnType<typeof buildOmniTimedVoiceoverPlan>;
  try {
    generated = await generateScript({
      model,
      projectName: project.name,
      targetAudience: project.target_audience,
      brandVoice: project.brand_voice,
      productName: product.name,
      productDescription: product.description,
      productReferenceNotes: product.product_reference_notes,
      ctaMode: product.cta_mode,
      ctaValue: product.cta_value,
      sourceScenario: { ...sourceScenario, script: referenceTranscript },
      directorBrief,
      wardrobeSource: project.wardrobe_source,
      durationRange,
      avatarSpeechGender,
      adaptationPlan: writerContentContext.adaptation,
      contentContract: writerContentContext,
    });
    timedVoiceoverPlan = buildOmniTimedVoiceoverPlan(generated.payload.script, {
      durationRange, speechSegments: generated.llmPromptChainSnapshot?.creativeScriptDraft.speechSegments,
    });
  } catch (error) {
    await failGeneratedScriptGeneration(pendingScript.id, error);
    throw error;
  }
  const directorCost = extractOpenRouterCostSummaryFromSnapshot(directorAnalysis?.source_snapshot);
  const openRouterUsage = [
    ...(directorCost?.layers || []),
    ...generated.openRouterUsage,
  ];
  const openRouterCost = summarizeOpenRouterUsage(openRouterUsage);

  const sourceSnapshot = {
    ...sourceSnapshotBase,
    script_writer_prompt_version: "reels-script-writer-v2-writer-owned-adaptation",
    generation_stage: "completed",
    generation_error: null,
    quality_check: generated.qualityCheck,
    semantic_review: generated.semanticReview || generated.payload.semantic_review || null,
    openrouter_usage: openRouterUsage,
    openrouter_cost: openRouterCost,
    background_audio_mood: normalizeAudioMood(generated.payload.background_audio_mood),
    llm_prompt_chain: generated.llmPromptChainSnapshot || null,
    generated_script_plan: {
      hook_options: generated.payload.hook_options,
      selected_hook: generated.payload.selected_hook,
      beats: generated.payload.beats.map((beat) => ({
        stage: beat.stage,
        visual_cue: beat.visualCue,
        voiceover: beat.voiceover,
      })),
    },
    timed_voiceover_plan: timedVoiceoverPlan,
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
    `UPDATE omni_generated_scripts
     SET status = 'draft',
         title = $2,
         hook = $3,
         script = $4,
         caption = $5,
         cta_keyword = $6,
         lead_magnet = $7,
         background_audio_mood = $8,
         source_snapshot = $9::jsonb,
         product_snapshot = $10::jsonb,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [
      pendingScript.id,
      generated.payload.title || null,
      generated.payload.hook || null,
      generated.payload.script || "",
      generated.payload.caption || null,
      generated.payload.cta_keyword || null,
      generated.payload.lead_magnet || null,
      normalizeAudioMood(generated.payload.background_audio_mood),
      JSON.stringify(sourceSnapshot),
      JSON.stringify(productSnapshot),
    ]
  );

  return normalizeScript(rows[0]);
}
