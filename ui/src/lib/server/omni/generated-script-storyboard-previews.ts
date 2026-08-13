import pool from "@/lib/db";
import type { OmniStoryboardSegment } from "@/lib/omni/storyboard/omni-storyboard-types";
import { hasProductVisibleStoryboardFrame } from "./omni-intro-product-contract";
import { generateStoryboardImage } from "./omni-storyboard-image-generator";
import { recordGeneratedScriptStoryboardFailure } from "./generated-script-storyboard-failure";
import { isKieStoryboardImagePendingError } from "./kie-omni-client";
import { recordKieGenerationCost } from "./omni-generation-costs";
import { isStoryboardVisionJsonFormatError } from "./storyboard-vision-validator";
import { ensureOmniSchema } from "./schema";
import type { OmniGenerationProvider } from "@/lib/omni/provider";
import type { DirectorBrief } from "./director-analysis-types";
import { buildStoryboardPlanSignature } from "./storyboard-cache-signature";
import {
  getGeneratedScriptStoryboardSetQuality,
  isCurrentStoryboardSetApproval,
  StoryboardSetQualityError,
  validateAndSaveGeneratedScriptStoryboardSet,
} from "./generated-script-storyboard-set-qa";
import { getStoryboardSetRepairSegments } from "./storyboard-set-vision-validator";
import {
  getGeneratedScriptStoryboardRepairContext,
  getPendingGeneratedScriptStoryboardKieTaskId,
  saveGeneratedScriptStoryboardKieTask,
} from "./generated-script-storyboard-kie-tasks";

type StoryboardPromptSegment = {
  index: number;
  storyboardPlan: OmniStoryboardSegment | null;
};

const STORYBOARD_PREVIEW_GENERATOR_VERSION = "storyboard-image-avatar-identity-v9";
const MAX_AUTOMATIC_JSON_FORMAT_RECOVERIES = 2;
const MAX_STORYBOARD_SET_REPAIR_ATTEMPTS = 2;

export async function ensureGeneratedScriptStoryboardUrls(input: {
  projectId: number;
  productId: number;
  scriptId: number;
  productName: string;
  productPhysicalContract?: string | null;
  avatarReferenceUrl: string | null;
  productReferenceUrls: readonly string[];
  directorReferenceImageUrls?: readonly string[];
  directorReferenceImageUrlsBySegment?: ReadonlyMap<number, readonly string[]>;
  directorBrief?: DirectorBrief | null;
  promptPlan: readonly StoryboardPromptSegment[];
  generationProvider?: OmniGenerationProvider;
}) {
  await ensureOmniSchema();
  const referenceSignature = buildReferenceSignature(input);
  const urls = await getStoredGeneratedScriptStoryboardUrls({ ...input, referenceSignature });
  let canonicalStoryboardReferenceUrl: string | null = null;

  for (const segment of input.promptPlan) {
    const cachedUrl = urls.get(segment.index) || null;
    if (cachedUrl) {
      if (segment.index === 1) canonicalStoryboardReferenceUrl = cachedUrl;
      continue;
    }

    if (!segment.storyboardPlan) continue;
    if (segment.index > 1 && !canonicalStoryboardReferenceUrl) {
      throw new Error("Storyboard 1 must be approved before generating later storyboard segments");
    }
    const pendingKieStoryboardTaskId = input.generationProvider === "kie-ai"
      ? await getPendingGeneratedScriptStoryboardKieTaskId({
        scriptId: input.scriptId,
        segmentIndex: segment.index,
        referenceSignature,
        generatorVersion: STORYBOARD_PREVIEW_GENERATOR_VERSION,
      })
      : null;
    const repairContext = await getGeneratedScriptStoryboardRepairContext({
      scriptId: input.scriptId,
      segmentIndex: segment.index,
      referenceSignature,
      generatorVersion: STORYBOARD_PREVIEW_GENERATOR_VERSION,
    });
    const generatedUrl = await tryGenerateStoryboardPreview({
      ...input,
      referenceSignature,
      segmentIndex: segment.index,
      storyboardPlan: segment.storyboardPlan,
      canonicalStoryboardReferenceUrl,
      pendingKieStoryboardTaskId,
      generationProvider: input.generationProvider,
      ...repairContext,
    });
    if (generatedUrl) {
      urls.set(segment.index, generatedUrl);
      if (segment.index === 1) canonicalStoryboardReferenceUrl = generatedUrl;
      continue;
    }
    throw new Error(`Storyboard ${segment.index} did not pass outfit validation`);
  }

  await ensureStoryboardSetApproval(input, urls, referenceSignature);
  return urls;
}

export async function getSavedGeneratedScriptStoryboardUrls(input: {
  projectId: number;
  productId: number;
  scriptId: number;
}) {
  await ensureOmniSchema();
  const { rows } = await pool.query<{
    segment_index: number;
    storyboard_reference_url: string | null;
  }>(
    `SELECT segment_index, storyboard_reference_url
     FROM omni_generated_script_storyboards
     WHERE project_id = $1
       AND product_id = $2
       AND generated_script_id = $3
       AND storyboard_reference_url IS NOT NULL
     ORDER BY segment_index ASC`,
    [input.projectId, input.productId, input.scriptId]
  );
  return rowsToUrlMap(rows);
}

async function getStoredGeneratedScriptStoryboardUrls(input: {
  projectId: number;
  productId: number;
  scriptId: number;
  referenceSignature: string;
}) {
  const { rows } = await pool.query<{
    segment_index: number;
    storyboard_reference_url: string | null;
  }>(
    `SELECT segment_index, storyboard_reference_url
     FROM omni_generated_script_storyboards
     WHERE project_id = $1
       AND product_id = $2
       AND generated_script_id = $3
       AND reference_signature = $4
       AND generator_version = $5
     ORDER BY segment_index ASC`,
    [
      input.projectId,
      input.productId,
      input.scriptId,
      input.referenceSignature,
      STORYBOARD_PREVIEW_GENERATOR_VERSION,
    ]
  );

  return rowsToUrlMap(rows);
}

async function tryGenerateStoryboardPreview(input: {
  projectId: number;
  productId: number;
  scriptId: number;
  productName: string;
  productPhysicalContract?: string | null;
  avatarReferenceUrl: string | null;
  productReferenceUrls: readonly string[];
  directorReferenceImageUrls?: readonly string[];
  directorReferenceImageUrlsBySegment?: ReadonlyMap<number, readonly string[]>;
  directorBrief?: DirectorBrief | null;
  referenceSignature: string;
  segmentIndex: number;
  storyboardPlan: OmniStoryboardSegment;
  canonicalStoryboardReferenceUrl: string | null;
  pendingKieStoryboardTaskId?: string | null;
  generationProvider?: OmniGenerationProvider;
  referenceSafetyInstructions?: readonly string[];
  previousStoryboardReferenceUrl?: string | null;
  previousRepairInstructions?: readonly string[];
  previousGenerationAttemptCount?: number;
}) {
  try {
    const url = await generateStoryboardImage({
      projectId: input.projectId,
      productId: input.productId,
      scriptId: input.scriptId,
      segmentIndex: input.segmentIndex,
      storyboard: input.storyboardPlan,
      productName: input.productName,
      productPhysicalContract: input.productPhysicalContract,
      avatarReferenceUrl: input.avatarReferenceUrl,
      productReferenceUrls: hasProductVisibleStoryboardFrame(input.storyboardPlan, input.productName)
        ? input.productReferenceUrls
        : [],
      directorReferenceImageUrls: getSegmentDirectorReferenceUrls(input, input.segmentIndex),
      canonicalStoryboardReferenceUrl: input.canonicalStoryboardReferenceUrl,
      directorBrief: input.directorBrief,
      generationProvider: input.generationProvider,
      pendingKieStoryboardTaskId: input.pendingKieStoryboardTaskId,
      referenceSafetyInstructions: input.referenceSafetyInstructions,
      previousStoryboardReferenceUrl: input.previousStoryboardReferenceUrl,
      previousRepairInstructions: input.previousRepairInstructions,
      previousGenerationAttemptCount: input.previousGenerationAttemptCount,
    });
    if (!url) return null;
    await upsertGeneratedScriptStoryboardUrl({ ...input, url });
    return url;
  } catch (error) {
    if (isKieStoryboardImagePendingError(error)) {
      await saveGeneratedScriptStoryboardKieTask({
        ...input,
        generatorVersion: STORYBOARD_PREVIEW_GENERATOR_VERSION,
        taskId: error.task.id,
        repairStoryboardReferenceUrl: error.storyboardRepairReferenceUrl,
        repairInstructions: error.storyboardRepairInstructions,
        generationAttemptCount: error.storyboardGenerationAttemptCount,
      });
      await recordKieGenerationCost({
        projectId: input.projectId,
        productId: input.productId,
        generatedScriptId: input.scriptId,
        operation: "storyboard",
        taskId: error.task.id,
        status: error.task.status,
        model: error.model,
        raw: error.task.raw,
      }).catch((recordError) => console.error("Could not record pending KIE storyboard cost:", recordError));
      throw error;
    }
    const failure = await recordGeneratedScriptStoryboardFailure({
      ...input,
      generatorVersion: STORYBOARD_PREVIEW_GENERATOR_VERSION,
    }, error).catch((recordError) => {
      console.error("Could not save storyboard generation diagnostic:", recordError);
      return null;
    });
    if (isStoryboardVisionJsonFormatError(error) && failure && failure.diagnosticAttemptCount <= MAX_AUTOMATIC_JSON_FORMAT_RECOVERIES) {
      error.retryWithoutJobAttempt = true;
    }
    throw error;
  }
}

async function ensureStoryboardSetApproval(input: {
  projectId: number;
  productId: number;
  scriptId: number;
  productName: string;
  productPhysicalContract?: string | null;
  avatarReferenceUrl: string | null;
  productReferenceUrls: readonly string[];
  directorReferenceImageUrls?: readonly string[];
  directorReferenceImageUrlsBySegment?: ReadonlyMap<number, readonly string[]>;
  directorBrief?: DirectorBrief | null;
  promptPlan: readonly StoryboardPromptSegment[];
  generationProvider?: OmniGenerationProvider;
}, urls: Map<number, string>, referenceSignature: string) {
  const storyboards = getStoryboardSetEntries(input.promptPlan, urls);
  const plannedStoryboardCount = input.promptPlan.filter((segment) => Boolean(segment.storyboardPlan)).length;
  if (storyboards.length !== plannedStoryboardCount) {
    throw new Error("All storyboard images must exist before cross-storyboard QA");
  }
  const storedQuality = await getGeneratedScriptStoryboardSetQuality(input.scriptId);
  if (isCurrentStoryboardSetApproval(storedQuality, storyboards)) return;

  for (let attempt = 0; attempt <= MAX_STORYBOARD_SET_REPAIR_ATTEMPTS; attempt += 1) {
    const validation = await validateAndSaveGeneratedScriptStoryboardSet({
      scriptId: input.scriptId,
      storyboards,
      attemptCount: attempt + 1,
    });
    if (validation.status === "pass") return;
    if (attempt === MAX_STORYBOARD_SET_REPAIR_ATTEMPTS) throw new StoryboardSetQualityError(validation);

    const repairSegments = getStoryboardSetRepairSegments(validation);
    const targets = repairSegments.length
      ? repairSegments
      : storyboards.map((storyboard) => storyboard.segmentIndex).filter((segmentIndex) => segmentIndex > 1);
    for (const segmentIndex of targets) {
      const storyboardPlan = input.promptPlan.find((segment) => segment.index === segmentIndex)?.storyboardPlan;
      if (!storyboardPlan) continue;
      const canonicalStoryboardReferenceUrl = urls.get(1) || null;
      if (!canonicalStoryboardReferenceUrl) throw new Error("Storyboard 1 must remain available for cross-storyboard repair");
      const repairContext = await getGeneratedScriptStoryboardRepairContext({
        scriptId: input.scriptId,
        segmentIndex,
        referenceSignature,
        generatorVersion: STORYBOARD_PREVIEW_GENERATOR_VERSION,
      });
      const regeneratedUrl = await tryGenerateStoryboardPreview({
        ...input,
        referenceSignature,
        segmentIndex,
        storyboardPlan,
        canonicalStoryboardReferenceUrl,
        previousStoryboardReferenceUrl: urls.get(segmentIndex) || repairContext.previousStoryboardReferenceUrl,
        previousRepairInstructions: repairContext.previousRepairInstructions,
        previousGenerationAttemptCount: repairContext.previousGenerationAttemptCount,
        referenceSafetyInstructions: buildSetRepairInstructions(validation.repairInstructions, validation.violations, segmentIndex),
      });
      if (!regeneratedUrl) throw new Error(`Storyboard ${segmentIndex} could not be regenerated for cross-storyboard QA`);
      urls.set(segmentIndex, regeneratedUrl);
    }
    storyboards.splice(0, storyboards.length, ...getStoryboardSetEntries(input.promptPlan, urls));
  }
}

function getStoryboardSetEntries(promptPlan: readonly StoryboardPromptSegment[], urls: ReadonlyMap<number, string>) {
  return promptPlan.flatMap((segment) => {
    const imageUrl = urls.get(segment.index);
    return segment.storyboardPlan && imageUrl
      ? [{ segmentIndex: segment.index, imageUrl, storyboard: segment.storyboardPlan }]
      : [];
  });
}

function buildSetRepairInstructions(
  instructions: readonly string[],
  violations: readonly { segmentIndex: number; code: string; evidence: string }[],
  segmentIndex: number
) {
  const targeted = violations
    .filter((violation) => violation.segmentIndex === segmentIndex)
    .map((violation) => `${violation.code}: ${violation.evidence}`);
  return [
    "Copy the canonical outfit and hair from the first approved storyboard exactly; do not change sleeves, neckline, fabric, color, accessories, or hairstyle.",
    ...instructions,
    ...targeted,
  ];
}

async function upsertGeneratedScriptStoryboardUrl(input: {
  projectId: number;
  productId: number;
  scriptId: number;
  segmentIndex: number;
  storyboardPlan: OmniStoryboardSegment | null;
  referenceSignature: string;
  url: string;
}) {
  await pool.query(
    `INSERT INTO omni_generated_script_storyboards (
       project_id,
       product_id,
       generated_script_id,
       segment_index,
       storyboard_plan,
       storyboard_reference_url,
       reference_signature,
       generator_version,
       kie_task_id,
       generation_status,
       generation_attempt_count,
       repair_storyboard_reference_url,
       repair_instructions,
       generation_error,
       last_attempt_at,
       retry_after,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, NULL, 'ready', 1, NULL, '[]'::jsonb, NULL, CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP)
     ON CONFLICT (generated_script_id, segment_index)
     DO UPDATE SET
       storyboard_plan = EXCLUDED.storyboard_plan,
       storyboard_reference_url = EXCLUDED.storyboard_reference_url,
       reference_signature = EXCLUDED.reference_signature,
       generator_version = EXCLUDED.generator_version,
       kie_task_id = NULL,
       generation_status = 'ready',
       generation_attempt_count = GREATEST(omni_generated_script_storyboards.generation_attempt_count, EXCLUDED.generation_attempt_count),
       repair_storyboard_reference_url = NULL,
       repair_instructions = '[]'::jsonb,
       generation_error = NULL,
       last_attempt_at = CURRENT_TIMESTAMP,
       retry_after = NULL,
       updated_at = CURRENT_TIMESTAMP`,
    [
      input.projectId,
      input.productId,
      input.scriptId,
      input.segmentIndex,
      input.storyboardPlan ? JSON.stringify(input.storyboardPlan) : null,
      input.url,
      input.referenceSignature,
      STORYBOARD_PREVIEW_GENERATOR_VERSION,
    ]
  );
}

function buildReferenceSignature(input: {
  avatarReferenceUrl: string | null;
  productPhysicalContract?: string | null;
  productReferenceUrls: readonly string[];
  directorReferenceImageUrls?: readonly string[];
  directorReferenceImageUrlsBySegment?: ReadonlyMap<number, readonly string[]>;
  generationProvider?: OmniGenerationProvider;
  promptPlan: readonly StoryboardPromptSegment[];
}) {
  const segmentReferenceUrls = Array.from(input.directorReferenceImageUrlsBySegment || [])
    .flatMap(([segmentIndex, urls]) =>
      urls.map((url) => `${segmentIndex}:${normalizeUrl(url) || ""}`)
    )
    .filter(Boolean)
    .sort();
  return [
    STORYBOARD_PREVIEW_GENERATOR_VERSION,
    buildStoryboardPlanSignature(input.promptPlan),
    input.generationProvider || "cometapi",
    normalizeUrl(input.avatarReferenceUrl) || "",
    normalizeContract(input.productPhysicalContract),
    ...input.productReferenceUrls.map((url) => normalizeUrl(url) || "").filter(Boolean).sort(),
    ...Array.from(input.directorReferenceImageUrls || []).map((url) => normalizeUrl(url) || "").filter(Boolean).sort(),
    ...segmentReferenceUrls,
  ].join("|");
}

function getSegmentDirectorReferenceUrls(input: {
  directorReferenceImageUrls?: readonly string[];
  directorReferenceImageUrlsBySegment?: ReadonlyMap<number, readonly string[]>;
}, segmentIndex: number) {
  return Array.from(
    input.directorReferenceImageUrlsBySegment?.get(segmentIndex) || input.directorReferenceImageUrls || []
  );
}

function rowsToUrlMap(rows: readonly { segment_index: number; storyboard_reference_url: string | null }[]) {
  return new Map(
    rows
      .map((row) => [Number(row.segment_index), normalizeUrl(row.storyboard_reference_url)] as const)
      .filter((entry): entry is readonly [number, string] => Number.isInteger(entry[0]) && Boolean(entry[1]))
  );
}

function normalizeUrl(value: string | null) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeContract(value: string | null | undefined) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}
