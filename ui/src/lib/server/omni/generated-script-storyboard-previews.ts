import pool from "@/lib/db";
import type { OmniStoryboardSegment } from "@/lib/omni/storyboard/omni-storyboard-types";
import { hasProductVisibleStoryboardFrame } from "./omni-intro-product-contract";
import { generateStoryboardImage } from "./omni-storyboard-image-generator";
import { ensureOmniSchema } from "./schema";
import type { OmniGenerationProvider } from "@/lib/omni/provider";

type StoryboardPromptSegment = {
  index: number;
  storyboardPlan: OmniStoryboardSegment | null;
};

const STORYBOARD_PREVIEW_GENERATOR_VERSION = "storyboard-image-speech-director-refs-v4";

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
  promptPlan: readonly StoryboardPromptSegment[];
  generationProvider?: OmniGenerationProvider;
}) {
  await ensureOmniSchema();
  const referenceSignature = buildReferenceSignature(input);
  const urls = await getStoredGeneratedScriptStoryboardUrls({ ...input, referenceSignature });
  let previousStoryboardReferenceUrl: string | null = null;

  for (const segment of input.promptPlan) {
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
      previousStoryboardReferenceUrl,
      generationProvider: input.generationProvider,
    });
    if (generatedUrl) {
      urls.set(segment.index, generatedUrl);
      previousStoryboardReferenceUrl = generatedUrl;
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
  referenceSignature: string;
  segmentIndex: number;
  storyboardPlan: OmniStoryboardSegment;
  previousStoryboardReferenceUrl: string | null;
  generationProvider?: OmniGenerationProvider;
}) {
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
      generationProvider: input.generationProvider,
    });
    if (!url) return null;
    await upsertGeneratedScriptStoryboardUrl({ ...input, url });
    return url;
  } catch (error) {
    console.warn("Generated script storyboard preview image failed:", {
      scriptId: input.scriptId,
      segmentIndex: input.segmentIndex,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
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
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, CURRENT_TIMESTAMP)
     ON CONFLICT (generated_script_id, segment_index)
     DO UPDATE SET
       storyboard_plan = EXCLUDED.storyboard_plan,
       storyboard_reference_url = EXCLUDED.storyboard_reference_url,
       reference_signature = EXCLUDED.reference_signature,
       generator_version = EXCLUDED.generator_version,
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
}) {
  const segmentReferenceUrls = Array.from(input.directorReferenceImageUrlsBySegment || [])
    .flatMap(([segmentIndex, urls]) =>
      urls.map((url) => `${segmentIndex}:${normalizeUrl(url) || ""}`)
    )
    .filter(Boolean)
    .sort();
  return [
    STORYBOARD_PREVIEW_GENERATOR_VERSION,
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
