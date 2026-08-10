import pool from "@/lib/db";
import type { OmniStoryboardSegment } from "@/lib/omni/storyboard/omni-storyboard-types";
import { hasProductVisibleStoryboardFrame } from "./omni-intro-product-contract";
import { generateStoryboardImage } from "./omni-storyboard-image-generator";
import { ensureOmniSchema } from "./schema";
import type { OmniGenerationProvider } from "@/lib/omni/provider";
import type { DirectorBrief } from "./director-analysis-types";
import { buildStoryboardPlanSignature } from "./storyboard-cache-signature";
import type { ReferenceTransferPolicy } from "./omni-reference-transfer-policy";

type StoryboardPromptSegment = {
  index: number;
  storyboardPlan: OmniStoryboardSegment | null;
  referencePolicy?: ReferenceTransferPolicy;
};

const STORYBOARD_PREVIEW_GENERATOR_VERSION = "storyboard-image-semantic-transfer-v7";
const DEFAULT_FAILURE_COOLDOWN_SECONDS = 600;

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
  maxSegments?: number;
}) {
  await ensureOmniSchema();
  const referenceSignature = buildReferenceSignature(input);
  const urls = await getStoredGeneratedScriptStoryboardUrls({ ...input, referenceSignature });
  let previousStoryboardReferenceUrl: string | null = null;

  const segmentsToGenerate = Number.isInteger(input.maxSegments) && (input.maxSegments || 0) > 0
    ? input.promptPlan.slice(0, input.maxSegments)
    : input.promptPlan;
  for (const segment of segmentsToGenerate) {
    const cachedUrl = urls.get(segment.index) || null;
    if (cachedUrl) {
      previousStoryboardReferenceUrl = cachedUrl;
      continue;
    }

    if (!segment.storyboardPlan) continue;
    const generatedUrl = await tryGenerateStoryboardPreview({
      ...input,
      referenceSignature,
      segmentIndex: segment.index,
      storyboardPlan: segment.storyboardPlan,
      referencePolicy: segment.referencePolicy,
      previousStoryboardReferenceUrl,
      generationProvider: input.generationProvider,
    });
    if (generatedUrl) {
      urls.set(segment.index, generatedUrl);
      previousStoryboardReferenceUrl = generatedUrl;
    } else {
      break;
    }
  }

  return urls;
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
  referencePolicy?: ReferenceTransferPolicy;
  referenceSignature: string;
  segmentIndex: number;
  storyboardPlan: OmniStoryboardSegment;
  previousStoryboardReferenceUrl: string | null;
  generationProvider?: OmniGenerationProvider;
}) {
  const claimed = await claimStoryboardGeneration(input);
  if (!claimed) return null;

  try {
    const url = await generateStoryboardImage({
      projectId: input.projectId,
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
      previousStoryboardReferenceUrl: input.previousStoryboardReferenceUrl,
      directorBrief: input.directorBrief,
      referencePolicy: input.referencePolicy,
      generationProvider: input.generationProvider,
    });
    if (!url) throw new Error("Storyboard image generation is disabled");
    await markGeneratedScriptStoryboardReady({ ...input, url });
    return url;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markGeneratedScriptStoryboardFailed({ ...input, error: message });
    console.warn("Generated script storyboard preview image failed:", {
      scriptId: input.scriptId,
      segmentIndex: input.segmentIndex,
      error: message,
    });
    return null;
  }
}

async function claimStoryboardGeneration(input: {
  projectId: number;
  productId: number;
  scriptId: number;
  segmentIndex: number;
  storyboardPlan: OmniStoryboardSegment | null;
  referenceSignature: string;
}) {
  const retryAfter = new Date(Date.now() + getFailureCooldownSeconds() * 1000);
  const { rowCount } = await pool.query(
    `INSERT INTO omni_generated_script_storyboards (
       project_id,
       product_id,
       generated_script_id,
       segment_index,
       storyboard_plan,
       storyboard_reference_url,
       reference_signature,
       generator_version,
       generation_status,
       generation_error,
       last_attempt_at,
       retry_after,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5::jsonb, NULL, $6, $7, 'generating', NULL, CURRENT_TIMESTAMP, $8, CURRENT_TIMESTAMP)
     ON CONFLICT (generated_script_id, segment_index)
     DO UPDATE SET
       project_id = EXCLUDED.project_id,
       product_id = EXCLUDED.product_id,
       storyboard_plan = EXCLUDED.storyboard_plan,
       storyboard_reference_url = NULL,
       reference_signature = EXCLUDED.reference_signature,
       generator_version = EXCLUDED.generator_version,
       generation_status = 'generating',
       generation_error = NULL,
       last_attempt_at = CURRENT_TIMESTAMP,
       retry_after = EXCLUDED.retry_after,
       updated_at = CURRENT_TIMESTAMP
     WHERE omni_generated_script_storyboards.reference_signature IS DISTINCT FROM EXCLUDED.reference_signature
        OR omni_generated_script_storyboards.generator_version IS DISTINCT FROM EXCLUDED.generator_version
        OR (
          omni_generated_script_storyboards.storyboard_reference_url IS NULL
          AND (
            omni_generated_script_storyboards.retry_after IS NULL
            OR omni_generated_script_storyboards.retry_after <= CURRENT_TIMESTAMP
          )
        )
     RETURNING id`,
    [
      input.projectId,
      input.productId,
      input.scriptId,
      input.segmentIndex,
      input.storyboardPlan ? JSON.stringify(input.storyboardPlan) : null,
      input.referenceSignature,
      STORYBOARD_PREVIEW_GENERATOR_VERSION,
      retryAfter,
    ]
  );
  return Boolean(rowCount);
}

async function markGeneratedScriptStoryboardReady(input: {
  projectId: number;
  productId: number;
  scriptId: number;
  segmentIndex: number;
  storyboardPlan: OmniStoryboardSegment | null;
  referenceSignature: string;
  url: string;
}) {
  await pool.query(
    `UPDATE omni_generated_script_storyboards
     SET storyboard_plan = $3::jsonb,
         storyboard_reference_url = $4,
         generation_status = 'ready',
         generation_error = NULL,
         retry_after = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE generated_script_id = $1
       AND segment_index = $2
       AND reference_signature = $5
       AND generator_version = $6`,
    [
      input.scriptId,
      input.segmentIndex,
      input.storyboardPlan ? JSON.stringify(input.storyboardPlan) : null,
      input.url,
      input.referenceSignature,
      STORYBOARD_PREVIEW_GENERATOR_VERSION,
    ]
  );
}

async function markGeneratedScriptStoryboardFailed(input: {
  scriptId: number;
  segmentIndex: number;
  referenceSignature: string;
  error: string;
}) {
  await pool.query(
    `UPDATE omni_generated_script_storyboards
     SET generation_status = 'failed',
         generation_error = $3,
         retry_after = $4,
         updated_at = CURRENT_TIMESTAMP
     WHERE generated_script_id = $1
       AND segment_index = $2
       AND reference_signature = $5
       AND generator_version = $6`,
    [
      input.scriptId,
      input.segmentIndex,
      input.error.slice(0, 2000),
      new Date(Date.now() + getFailureCooldownSeconds() * 1000),
      input.referenceSignature,
      STORYBOARD_PREVIEW_GENERATOR_VERSION,
    ]
  );
}

function getFailureCooldownSeconds() {
  const configured = Number.parseInt(process.env.OMNI_STORYBOARD_FAILURE_COOLDOWN_SECONDS || "", 10);
  return Number.isFinite(configured) && configured >= 60 ? configured : DEFAULT_FAILURE_COOLDOWN_SECONDS;
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
