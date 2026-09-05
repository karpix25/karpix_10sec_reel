import pool from "@/lib/db";
import type { OmniGeneratedScript } from "@/lib/omni/types";
import type { OpenRouterUsageRecord } from "@/lib/omni/openrouter-cost";
import { getGeneratedScript } from "./generated-scripts";
import { getOmniProject } from "./projects";
import { requireOmniProductInProject } from "./products";
import { getLatestOmniClientAvatar } from "./avatars";
import { getLegacyScenario } from "./legacy-scenarios";
import { resolveOmniDurationRange } from "./omni-duration-settings";
import { resolveNarratorSpeechGender } from "../../omni/avatar-speech-gender";
import { extractDirectorBriefFromSnapshot } from "./director-analysis-types";
import { buildWriterOwnedScriptContentContract } from "./script-content-contract";
import { evaluateCreativeScriptDraft } from "./llm-creative-copywriter";
import { buildOmniTimedVoiceoverPlanFromSegments } from "./omni-timed-voiceover-plan";

export async function editGeneratedScript(input: { projectId: number; productId: number; scriptId: number; script: unknown }) {
  if (typeof input.script !== "string" || !input.script.trim() || input.script.length > 10_000) {
    throw new Error("Сценарий требует исправления: нужен текст длиной от одного до десяти тысяч символов.");
  }
  const saved = await getGeneratedScript(input);
  if (!saved) throw new Error("Generated script not found for this product");
  if (saved.status === "generating") throw new Error("Сценарий изменился: дождитесь завершения генерации.");
  const linked = await pool.query("SELECT 1 FROM omni_reels WHERE source_generated_script_id = $1 LIMIT 1", [input.scriptId]);
  if (linked.rows.length) throw new Error("Сценарий изменился или уже используется для ролика. Для готового ролика создайте новый сценарий.");
  const [project, product, avatar, source] = await Promise.all([
    getOmniProject(input.projectId), requireOmniProductInProject(input.projectId, input.productId),
    getLatestOmniClientAvatar(input.projectId),
    saved.source_legacy_scenario_id ? getLegacyScenario(saved.source_legacy_scenario_id) : null,
  ]);
  if (!project || !source) throw new Error("Сценарий требует исправления: исходный референс недоступен.");
  const reference = typeof saved.source_snapshot?.transcript === "string" ? saved.source_snapshot.transcript : source.script;
  const durationRange = await resolveOmniDurationRange({ project, product, legacyClientId: saved.source_legacy_client_id });
  const contract = buildWriterOwnedScriptContentContract(reference);
  const script = input.script.trim();
  const usage: OpenRouterUsageRecord[] = [];
  const evaluation = await evaluateCreativeScriptDraft({
    model: process.env.SCENARIO_MODEL || "google/gemini-3.5-flash-lite",
    projectName: project.name, targetAudience: project.target_audience, brandVoice: project.brand_voice,
    productName: product.name, productDescription: product.description, productReferenceNotes: product.product_reference_notes,
    ctaMode: product.cta_mode, ctaValue: product.cta_value, sourceScenario: { ...source, script: reference },
    avatarSpeechGender: resolveNarratorSpeechGender(avatar?.speech_gender), durationRange,
    directorBrief: extractDirectorBriefFromSnapshot(saved.source_snapshot), wardrobeSource: project.wardrobe_source,
    adaptationPlan: contract.adaptation, contentContract: contract,
  }, script, (record) => usage.push(record), 1);
  const snapshot = { ...saved.source_snapshot };
  const previousChain = snapshot.llm_prompt_chain || snapshot.llm_prompt_chain_partial;
  if (previousChain && typeof previousChain === "object" && "creativeAttemptDiagnostics" in previousChain) {
    snapshot.creative_attempt_history = previousChain.creativeAttemptDiagnostics;
  }
  for (const key of ["llm_prompt_chain", "llm_prompt_chain_partial", "generated_script_plan", "timed_voiceover_plan"]) delete snapshot[key];
  Object.assign(snapshot, {
    generation_stage: evaluation.issues.length ? "script_validation" : "completed",
    generation_error: evaluation.issues.length ? evaluation.issues.join("\n") : null,
    quality_check: evaluation.preflight.qualityCheck, semantic_review: evaluation.semanticReview,
    duration_range: durationRange,
    manual_edit_usage: [...(Array.isArray(snapshot.manual_edit_usage) ? snapshot.manual_edit_usage : []), ...usage],
    manual_edit_history: [...(Array.isArray(snapshot.manual_edit_history) ? snapshot.manual_edit_history : []), {
      at: new Date().toISOString(), previousScript: saved.script, script,
      issues: evaluation.issues, semanticReview: evaluation.semanticReview,
    }],
    timed_voiceover_plan: evaluation.issues.length || !evaluation.preflight.segmentPlan ? null :
      buildOmniTimedVoiceoverPlanFromSegments(evaluation.preflight.segmentPlan, durationRange),
  });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locks = await client.query<{ ready: boolean }>(
      "SELECT pg_try_advisory_xact_lock(53901, $1::int) AND pg_try_advisory_xact_lock(53902, $1::int) AS ready", [input.scriptId],
    );
    if (!locks.rows[0]?.ready) throw new Error("Сценарий изменился: дождитесь завершения подготовки раскадровки.");
    const result = await client.query<OmniGeneratedScript>(
      `UPDATE omni_generated_scripts SET script = $4, hook = NULL, status = 'draft',
         source_snapshot = $5::jsonb, prepared_prompt_plan = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND project_id = $2 AND product_id = $3 AND script = $6
         AND source_snapshot IS NOT DISTINCT FROM $7::jsonb AND status = $8
         AND NOT EXISTS (SELECT 1 FROM omni_reels WHERE source_generated_script_id = $1)
         AND NOT EXISTS (SELECT 1 FROM omni_generated_script_storyboards WHERE generated_script_id = $1 AND generation_status IN ('generating', 'submitting'))
       RETURNING *`,
      [input.scriptId, input.projectId, input.productId, script, JSON.stringify(snapshot), saved.script, JSON.stringify(saved.source_snapshot), saved.status],
    );
    if (!result.rows[0]) throw new Error("Сценарий изменился или уже используется для ролика. Обновите карточку; для готового ролика создайте новый сценарий.");
    await client.query("DELETE FROM omni_generated_script_storyboards WHERE generated_script_id = $1", [input.scriptId]);
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
