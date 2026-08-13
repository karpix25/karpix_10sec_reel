import pool from "@/lib/db";
import type { OmniStoryboardSegment } from "@/lib/omni/storyboard/omni-storyboard-types";
import { hasProductVisibleStoryboardFrame } from "./omni-intro-product-contract";
import {
  generateStoryboardImage,
  StoryboardImageRepairExhaustedError,
} from "./omni-storyboard-image-generator";
import { recordGeneratedScriptStoryboardFailure } from "./generated-script-storyboard-failure";
import {
  isKieStoryboardImagePendingError,
  isKieStoryboardImagePollingError,
  isKieStoryboardImageSubmissionUnknownError,
} from "./kie-omni-client";
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
import {
  getStoryboardSetRepairSegments,
  STORYBOARD_SET_QA_POLICY_VERSION,
} from "./storyboard-set-vision-validator";
import {
  getGeneratedScriptStoryboardRepairContext,
  reserveGeneratedScriptStoryboardKieSubmission,
  saveGeneratedScriptStoryboardKieTask,
  withGeneratedScriptStoryboardLock,
} from "./generated-script-storyboard-kie-tasks";
import {
  StoryboardKieSubmissionInProgressError,
  StoryboardKieSubmissionStalledError,
} from "./storyboard-kie-submission-state";

type StoryboardPromptSegment = {
  index: number;
  storyboardPlan: OmniStoryboardSegment | null;
};

type EnsureGeneratedScriptStoryboardUrlsInput = {
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
};

const STORYBOARD_PREVIEW_GENERATOR_VERSION = "storyboard-image-avatar-identity-v11";
const MAX_AUTOMATIC_JSON_FORMAT_RECOVERIES = 2;
const MAX_STORYBOARD_SET_REPAIR_ATTEMPTS = 2;

export async function ensureGeneratedScriptStoryboardUrls(input: EnsureGeneratedScriptStoryboardUrlsInput) {
  await ensureOmniSchema();
  const urls = await withGeneratedScriptStoryboardLock(input.scriptId, () => ensureGeneratedScriptStoryboardUrlsLocked(input));
  if (urls) return urls;
  throw new StoryboardKieSubmissionInProgressError();
}

async function ensureGeneratedScriptStoryboardUrlsLocked(input: EnsureGeneratedScriptStoryboardUrlsInput) {
  const referenceSignature = buildReferenceSignature(input);
  const urls = await getStoredGeneratedScriptStoryboardUrls({ ...input, referenceSignature });
  const deferVisualQa = input.promptPlan.filter((segment) => Boolean(segment.storyboardPlan)).length > 1;
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
    const repairContext = await getGeneratedScriptStoryboardRepairContext({
      scriptId: input.scriptId,
      segmentIndex: segment.index,
    });
    const generatedUrl = await tryGenerateStoryboardPreview({
      ...input,
      referenceSignature,
      segmentIndex: segment.index,
      storyboardPlan: segment.storyboardPlan,
      canonicalStoryboardReferenceUrl,
      generationProvider: input.generationProvider,
      deferVisualQa,
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
       AND generation_status = 'ready'
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
       AND generation_status = 'ready'
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
  deferVisualQa?: boolean;
  previousStoryboardReferenceUrl?: string | null;
  previousRepairInstructions?: readonly string[];
  previousGenerationAttemptCount?: number;
  resetAttemptBudget?: boolean;
}) {
  const kieSubmission = input.generationProvider === "kie-ai"
    ? await reserveGeneratedScriptStoryboardKieSubmission({
      projectId: input.projectId,
      productId: input.productId,
      scriptId: input.scriptId,
      segmentIndex: input.segmentIndex,
      storyboardPlan: input.storyboardPlan,
      referenceSignature: input.referenceSignature,
      generatorVersion: STORYBOARD_PREVIEW_GENERATOR_VERSION,
      resetAttemptBudget: input.resetAttemptBudget,
    })
    : null;
  if (kieSubmission?.kind === "wait") throw new StoryboardKieSubmissionInProgressError();
  if (kieSubmission?.kind === "stalled") throw new StoryboardKieSubmissionStalledError();
  if (kieSubmission?.kind === "exhausted") {
    throw new StoryboardImageRepairExhaustedError({
      validation: null,
      generationAttemptCount: kieSubmission.generationAttemptCount,
      failureReason: kieSubmission.generationError,
    });
  }
  const resetsPreviousRepair = kieSubmission?.kind === "submit"
    && kieSubmission.generationAttemptCount === 1
    && Number(input.previousGenerationAttemptCount || 0) > 0;
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
      pendingKieStoryboardTaskId: kieSubmission?.kind === "poll"
        ? kieSubmission.taskId
        : input.pendingKieStoryboardTaskId,
      deferVisualQa: input.deferVisualQa,
      referenceSafetyInstructions: input.referenceSafetyInstructions,
      previousStoryboardReferenceUrl: resetsPreviousRepair ? null : input.previousStoryboardReferenceUrl,
      previousRepairInstructions: resetsPreviousRepair ? [] : input.previousRepairInstructions,
      previousGenerationAttemptCount: kieSubmission?.kind === "submit"
        ? kieSubmission.generationAttemptCount - 1
        : input.previousGenerationAttemptCount,
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
    if (isKieStoryboardImagePollingError(error) || isKieStoryboardImageSubmissionUnknownError(error)) {
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
  const deferVisualQa = plannedStoryboardCount > 1;
  if (storyboards.length !== plannedStoryboardCount) {
    throw new Error("All storyboard images must exist before cross-storyboard QA");
  }
  const storedQuality = await getGeneratedScriptStoryboardSetQuality(input.scriptId);
  const resetAttemptBudgetForQaPolicy = Boolean(
    storedQuality && storedQuality.policyVersion !== STORYBOARD_SET_QA_POLICY_VERSION
  );
  if (isCurrentStoryboardSetApproval(storedQuality, storyboards)) return;

  for (let attempt = 0; attempt <= MAX_STORYBOARD_SET_REPAIR_ATTEMPTS; attempt += 1) {
    const validation = await validateAndSaveGeneratedScriptStoryboardSet({
      scriptId: input.scriptId,
      storyboards,
      attemptCount: attempt + 1,
      avatarReferenceUrl: input.avatarReferenceUrl,
      productName: input.productName,
      productReferenceUrls: input.productReferenceUrls,
    });
    if (validation.status === "pass") return;
    if (attempt === MAX_STORYBOARD_SET_REPAIR_ATTEMPTS) throw new StoryboardSetQualityError(validation);

    const repairSegments = getStoryboardSetRepairSegments(validation);
    const allSegments = storyboards.map((storyboard) => storyboard.segmentIndex);
    const targets = repairSegments.length
      ? repairSegments.includes(1) ? allSegments : repairSegments
      : allSegments;
    for (const segmentIndex of targets) {
      const storyboardPlan = input.promptPlan.find((segment) => segment.index === segmentIndex)?.storyboardPlan;
      if (!storyboardPlan) continue;
      const canonicalStoryboardReferenceUrl = segmentIndex === 1 ? null : urls.get(1) || null;
      if (segmentIndex > 1 && !canonicalStoryboardReferenceUrl) throw new Error("Storyboard 1 must remain available for cross-storyboard repair");
      const repairContext = await getGeneratedScriptStoryboardRepairContext({
        scriptId: input.scriptId,
        segmentIndex,
      });
      let regeneratedUrl: string | null;
      try {
        regeneratedUrl = await tryGenerateStoryboardPreview({
          ...input,
          referenceSignature,
          segmentIndex,
          storyboardPlan,
          canonicalStoryboardReferenceUrl,
          previousStoryboardReferenceUrl: urls.get(segmentIndex) || repairContext.previousStoryboardReferenceUrl,
          previousRepairInstructions: repairContext.previousRepairInstructions,
          previousGenerationAttemptCount: repairContext.previousGenerationAttemptCount,
          resetAttemptBudget: resetAttemptBudgetForQaPolicy && attempt === 0,
          deferVisualQa,
          referenceSafetyInstructions: buildSetRepairInstructions(validation.repairInstructions, validation.violations, segmentIndex),
        });
      } catch (error) {
        if (error instanceof StoryboardImageRepairExhaustedError) throw new StoryboardSetQualityError(validation);
        throw error;
      }
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
  generationProvider?: OmniGenerationProvider;
  promptPlan: readonly StoryboardPromptSegment[];
}) {
  return [
    STORYBOARD_PREVIEW_GENERATOR_VERSION,
    buildStoryboardPlanSignature(input.promptPlan),
    input.generationProvider || "cometapi",
    normalizeUrl(input.avatarReferenceUrl) || "",
    normalizeContract(input.productPhysicalContract),
    ...input.productReferenceUrls.map((url) => normalizeUrl(url) || "").filter(Boolean).sort(),
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
