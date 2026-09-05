import { createHash } from "node:crypto";
import pool from "@/lib/db";
import { assertGeneratedScriptReady, assertStoredGeneratedScriptReady } from "./generated-script-readiness";
import { buildOmniSegmentPrompts, type OmniSegmentPrompt } from "./omni-prompt-builder";
import { repairOmniPromptPlanWithAi } from "./omni-physical-repair-pipeline";
import { prepareOmniPromptPlanWithSemanticRepair } from "./omni-storyboard-semantic-repair";
import { assertPhysicalPromptPlan } from "./physical-scene-validator";
import { assertStoryboardPromptContracts } from "./storyboard/storyboard-contract-validator";
import { renderCompactRussianOmniStoryboardPrompt } from "./storyboard/omni-storyboard-renderer";
import { validateOmniStoryboardSegment } from "../../omni/storyboard/omni-storyboard-contract";
import { resolveReferenceSceneMode } from "./omni-reference-scene-mode";
import { resolveReferenceFormatMode } from "./omni-reference-format-mode";
import { hasCompleteSourceTimeline } from "./omni-reference-transfer-policy";
import { resolveProductReferenceImageUrls } from "./omni-product-reference-images";
import { validatePromptVoiceoverIsolation, validateVoiceoverSequence } from "./omni-prompt-validator";
import { adaptDirectorBriefForAvatarReel, ensureTalkingAvatarInPromptPlan } from "./omni-avatar-reel-plan";

export type OmniPromptPreparationInput = Parameters<typeof buildOmniSegmentPrompts>[0] & {
  projectId: number;
  productId: number;
};

export const OMNI_PREPARED_PLAN_VERSION = "avatar-broll-timeline-v1";
const PROMPT_LOCK_NAMESPACE = 53_902;
type SavedPromptPlan = { version: string; signature: string; segments: OmniSegmentPrompt[] };

export function buildOmniPromptPreparationSignature(input: OmniPromptPreparationInput) {
  const { generatedScript, avatar, product } = input;
  return createHash("sha256").update(JSON.stringify({
    version: OMNI_PREPARED_PLAN_VERSION,
    projectId: input.projectId,
    productId: input.productId,
    script: generatedScript?.script || input.legacyTranscript || input.brief || "",
    sourceSnapshot: generatedScript?.source_snapshot || null,
    directorBrief: adaptDirectorBriefForAvatarReel(input.directorBrief),
    product: {
      name: product.name, description: product.description, refs: product.product_refs,
      notes: product.product_reference_notes, visual: product.product_visual_profile,
      physics: product.product_physical_contract, ctaMode: input.ctaMode, ctaValue: input.ctaValue,
    },
    avatar: avatar ? {
      id: avatar.id, reference: avatar.reference_url, prompt: avatar.prompt,
      gender: avatar.speech_gender, characterId: avatar.kie_character_id,
    } : null,
    wardrobeSource: input.wardrobeSource,
    targetAudience: input.targetAudience,
    timedVoiceoverPlan: input.timedVoiceoverPlan,
    voiceSegments: input.voiceSegments,
    segmentCount: input.segmentCount,
    segmentSeconds: input.segmentSeconds,
    segmentDurationsSeconds: input.segmentDurationsSeconds,
    referenceSourceDurationSeconds: input.referenceSourceDurationSeconds,
    brief: input.brief,
    // The selected format stays pinned; unrelated new reels must not invalidate this plan.
  }, canonicalJson)).digest("hex");
}

function canonicalJson(_key: string, value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
}

export function readMatchingPreparedOmniPromptPlan(value: unknown, signature: string): OmniSegmentPrompt[] | null {
  if (!value || typeof value !== "object") return null;
  const saved = value as Partial<SavedPromptPlan>;
  if (saved.version !== OMNI_PREPARED_PLAN_VERSION || saved.signature !== signature ||
    !Array.isArray(saved.segments) || !saved.segments.length) return null;
  return saved.segments;
}

export async function readPreparedOmniPromptPlan(input: OmniPromptPreparationInput, db: Pick<typeof pool, "query"> = pool) {
  if (!input.generatedScript) return null;
  const { rows } = await db.query<{ prepared_prompt_plan: unknown }>(
    `SELECT prepared_prompt_plan FROM omni_generated_scripts
     WHERE id = $1 AND project_id = $2 AND product_id = $3 AND status IN ('draft', 'approved')`,
    [input.generatedScript.id, input.projectId, input.productId],
  );
  const plan = readMatchingPreparedOmniPromptPlan(rows[0]?.prepared_prompt_plan, buildOmniPromptPreparationSignature(input));
  if (plan) assertPreparedOmniPromptPlan(input, plan);
  return plan;
}

/** Only explicit preparation / reel creation may invoke the existing paid repair stages. */
export async function prepareOmniPromptPlan(input: OmniPromptPreparationInput): Promise<OmniSegmentPrompt[]> {
  if (input.generatedScript) assertGeneratedScriptReady(input.generatedScript);
  input = { ...input, directorBrief: adaptDirectorBriefForAvatarReel(input.directorBrief) };
  assertOmniPreparationInputs(input);
  if (!input.generatedScript) return buildPreparedPlan(input);
  // ponytail: one pooled connection per preparation; use a durable lease if concurrent preparation approaches the pool limit.
  const client = await pool.connect();
  const scriptId = input.generatedScript.id;
  let locked = false;
  try {
    const { rows } = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1::int, $2::int) AS locked", [PROMPT_LOCK_NAMESPACE, scriptId],
    );
    locked = Boolean(rows[0]?.locked);
    if (!locked) throw new Error("План уже готовится. Повторите запрос после завершения подготовки.");
    await assertStoredGeneratedScriptReady({ scriptId, projectId: input.projectId, productId: input.productId, expectedScript: input.generatedScript.script }, client);
    const saved = await readPreparedOmniPromptPlan(input, client);
    if (saved) return saved;
    const segments = await buildPreparedPlan(input);
    const plan: SavedPromptPlan = {
      version: OMNI_PREPARED_PLAN_VERSION,
      signature: buildOmniPromptPreparationSignature(input),
      segments,
    };
    const result = await client.query(
      `UPDATE omni_generated_scripts SET prepared_prompt_plan = $4::jsonb
       WHERE id = $1 AND project_id = $2 AND product_id = $3
         AND status IN ('draft', 'approved') AND script = $5`,
      [scriptId, input.projectId, input.productId, JSON.stringify(plan), input.generatedScript.script],
    );
    if (result.rowCount !== 1) throw new Error("Сценарий изменился во время подготовки. Подготовьте план заново.");
    return segments;
  } finally {
    try {
      if (locked) await client.query("SELECT pg_advisory_unlock($1::int, $2::int)", [PROMPT_LOCK_NAMESPACE, scriptId]);
    } finally {
      client.release();
    }
  }
}

function assertOmniPreparationInputs(input: OmniPromptPreparationInput) {
  if (!input.avatar?.reference_url) throw new Error("Для разговорного ролика нужен сохранённый аватар с изображением.");
  if (!resolveProductReferenceImageUrls(input.product).length) throw new Error("Добавьте изображение продукта для товарных B-roll.");
  if (!input.directorBrief || !hasCompleteSourceTimeline(input.directorBrief)) {
    throw new Error("Не удалось разобрать reference video: нужен полный визуальный таймлайн выбранного референса.");
  }
  const analyzedEnd = Math.max(...(input.directorBrief.camera_timeline || []).map((interval) => interval.end_sec));
  if (input.referenceSourceDurationSeconds && analyzedEnd < input.referenceSourceDurationSeconds - 0.75) {
    throw new Error("Не удалось разобрать reference video: визуальный таймлайн не покрывает конец выбранного референса.");
  }
}

async function buildPreparedPlan(input: OmniPromptPreparationInput) {
  const directorBrief = input.directorBrief || null;
  const repaired = await repairOmniPromptPlanWithAi({
    promptPlan: ensureTalkingAvatarInPromptPlan(buildOmniSegmentPrompts(input), input.product.name),
    productName: input.product.name,
    productPhysicalContract: input.product.product_physical_contract,
    segmentCount: input.segmentCount,
    directorBrief,
    referenceSceneMode: resolveReferenceSceneMode(directorBrief),
  });
  const reviewed = await prepareOmniPromptPlanWithSemanticRepair({
    projectId: input.projectId, productId: input.productId, promptPlan: repaired,
    script: input.generatedScript?.script || input.legacyTranscript || input.brief || "",
    productName: input.product.name, productDescription: input.product.description,
    productPhysicalContract: input.product.product_physical_contract,
    directorBrief,
    referenceSceneMode: resolveReferenceSceneMode(directorBrief),
    referenceFormatMode: resolveReferenceFormatMode(directorBrief),
    model: process.env.OMNI_STORYBOARD_SEMANTIC_REVIEW_MODEL?.trim()
      || process.env.OMNI_DIRECTOR_ANALYSIS_MODEL?.trim()
      || process.env.SCENARIO_MODEL?.trim() || "google/gemini-2.5-flash",
  });
  const plan = reviewed.map((segment) => {
    if (!segment.storyboardPlan) throw new Error(`Storyboard ${segment.index} is required`);
    return {
      ...segment,
      storyboardValidation: validateOmniStoryboardSegment(segment.storyboardPlan),
      prompt: renderCompactRussianOmniStoryboardPrompt({
        storyboard: segment.storyboardPlan, productName: input.product.name,
        productPhysicalContract: input.product.product_physical_contract,
        productRole: segment.creativePlan.productRole, segmentCount: reviewed.length, directorBrief,
      }),
    };
  });
  assertPreparedOmniPromptPlan(input, plan);
  return plan;
}

function assertPreparedOmniPromptPlan(input: OmniPromptPreparationInput, plan: readonly OmniSegmentPrompt[]) {
  assertPhysicalPromptPlan(plan);
  assertStoryboardPromptContracts(plan, input.product.name, { wardrobeContinuity: input.directorBrief?.wardrobe_continuity });
  const script = input.generatedScript?.script || input.legacyTranscript || input.brief || "";
  if (plan.length !== input.segmentCount || !validateVoiceoverSequence(script, plan.map((segment) => segment.creativePlan)) ||
    validatePromptVoiceoverIsolation(plan).length) throw new Error("План изменил утверждённую последовательность речи.");
  if (!plan.some((segment) => segment.storyboardPlan?.frames.some((frame) => frame.speechMode === "on_camera"))) {
    throw new Error("В плане отсутствует разговорный аватар. Нужны кадры с речью аватара и отдельные B-roll.");
  }
  for (const segment of plan) {
    if (!segment.storyboardPlan || !validateOmniStoryboardSegment(segment.storyboardPlan).valid ||
      segment.durationSeconds !== segment.storyboardPlan.durationSeconds) throw new Error(`Invalid Omni segment ${segment.index}`);
  }
}
