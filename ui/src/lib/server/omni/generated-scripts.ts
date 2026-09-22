import pool from "@/lib/db";
import { normalizeAudioMood } from "@/lib/audio-library/moods";
import { extractOpenRouterCostSummaryFromSnapshot, summarizeOpenRouterUsage } from "@/lib/omni/openrouter-cost";
import type { OmniAutomationJobSummary, OmniGeneratedScript } from "@/lib/omni/types";
import { ensureOmniSchema } from "./schema";
import { getGeneratedScriptCostSummaries } from "./omni-generation-costs";
import { getLatestOmniClientAvatar } from "./avatars";
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
import { resolveInstagramVideoWithScrapeCreators } from "./scrapecreators-client";
import { storeDirectorReferenceVideo } from "./director-video-storage";


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
  const { sourceScenario, sourceMode } = await resolveGeneratedScriptSource(input);
  if (!sourceScenario.reels_url?.trim()) {
    throw new Error("Сценарий можно создать только из legacy-reference с Instagram video URL.");
  }
  const resolvedVideo = await resolveInstagramVideoWithScrapeCreators(sourceScenario.reels_url);
  await advanceGeneratedScriptSourceCursor({
    projectId: input.projectId,
    productId: input.productId,
    legacyScenarioId: sourceScenario.id,
  });
  const durationRange = await resolveOmniDurationRange({
    project,
    product,
    legacyClientId: sourceScenario.client_id,
  });
  const avatarSpeechGender = resolveNarratorSpeechGender(
    avatar?.speech_gender,
    false,
  );
  const referenceTranscript = sourceScenario.script.trim();
  const model = process.env.SCENARIO_MODEL || "google/gemini-3.8-flash";
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
    director_analysis_id: null,
    director_analysis_status: "processing_in_unified_call",
    director_analysis: null,
    reference_format_mode: null,
    reference_transfer_plan: null,
    director_video_url: resolvedVideo.videoUrl,
    director_reference_image_urls: [],
    wardrobe_source: project.wardrobe_source,
    avatar_speech_gender: avatarSpeechGender,
    director_analysis_model: model,
    director_analysis_prompt_version: "unified-content-planner-v1",
    director_analysis_error: null,
    generated_script_plan_version: "unified-content-planner-v1",
    duration_range: durationRange,
    script_adaptation_mode: "writer_owned",
  };
  const pendingScript = await createGeneratedScriptGenerationRecord({
    projectId: input.projectId,
    productId: input.productId,
    sourceLegacyScenarioId: sourceScenario.id,
    sourceLegacyClientId: sourceScenario.client_id,
    directorAnalysisId: null,
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
      directorBrief: null,
      wardrobeSource: project.wardrobe_source,
      durationRange,
      avatarSpeechGender,
      adaptationPlan: writerContentContext.adaptation,
      contentContract: writerContentContext,
      referenceVideoUrl: resolvedVideo.videoUrl,
    });
    timedVoiceoverPlan = buildOmniTimedVoiceoverPlan(generated.payload.script, { durationRange });
  } catch (error) {
    await failGeneratedScriptGeneration(pendingScript.id, error);
    throw error;
  }
  const directorBrief = adaptDirectorBriefForAvatarReel(generated.llmPromptChainSnapshot?.directorBrief || null);
  if (!directorBrief) throw new Error("Unified Gemini response did not contain a valid director analysis.");
  let storedVideoUrl: string | null = null;
  try {
    storedVideoUrl = (await storeDirectorReferenceVideo({
      legacyScenarioId: sourceScenario.id,
      videoUrl: resolvedVideo.videoUrl,
    }))?.url || null;
  } catch (error) {
    console.warn("Unified reference video archival failed:", error);
  }
  const referenceTransferPlan = buildReferenceTransferPolicy({
    hasProductReference: product.product_refs.some((reference) => reference.kind === "image"),
    directorBrief,
    adaptationMode: "writer_owned",
  });
  const openRouterUsage = generated.openRouterUsage;
  const openRouterCost = summarizeOpenRouterUsage(openRouterUsage);

  const sourceSnapshot = {
    ...sourceSnapshotBase,
    director_analysis_status: "completed",
    director_analysis: directorBrief,
    reference_format_mode: resolveReferenceFormatMode(directorBrief),
    reference_transfer_plan: referenceTransferPlan,
    director_video_url: storedVideoUrl || resolvedVideo.videoUrl,
    reference_transcript: generated.llmPromptChainSnapshot?.spokenTranscript || referenceTranscript,
    reference_analysis: generated.llmPromptChainSnapshot?.referenceAnalysis || null,
    script_writer_prompt_version: "unified-content-planner-v1",
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
