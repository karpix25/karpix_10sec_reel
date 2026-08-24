import pool from "@/lib/db";
import type { StoryboardSetQualityRecord, StoryboardSetVisionValidation } from "@/lib/omni/storyboard/omni-storyboard-set-vision-types";
import {
  buildStoryboardSetQualityRecord,
  STORYBOARD_SET_QA_POLICY_VERSION,
  validateStoryboardSet,
} from "./storyboard-set-vision-validator";
import type { OmniStoryboardSegment } from "@/lib/omni/storyboard/omni-storyboard-types";
import type { DirectorWardrobeContinuity } from "./director-wardrobe";
import type { ReferenceFormatMode } from "./omni-reference-format-mode";

type StoryboardSetEntry = {
  segmentIndex: number;
  imageUrl: string;
  storyboard: OmniStoryboardSegment;
};

export class StoryboardSetQualityError extends Error {
  readonly validation: StoryboardSetVisionValidation;

  constructor(validation: StoryboardSetVisionValidation) {
    super(`Cross-storyboard QA blocked video creation: ${validation.violations.map((item) => `segment ${item.segmentIndex}: ${item.code}`).join(", ") || "no actionable repair"}`);
    this.name = "StoryboardSetQualityError";
    this.validation = validation;
  }
}

export function isStoryboardSetQualityError(error: unknown): error is StoryboardSetQualityError {
  return error instanceof StoryboardSetQualityError;
}

export async function getGeneratedScriptStoryboardSetQuality(scriptId: number) {
  const { rows } = await pool.query<{ storyboard_set_validation: StoryboardSetQualityRecord | null }>(
    "SELECT storyboard_set_validation FROM omni_generated_scripts WHERE id = $1 LIMIT 1",
    [scriptId]
  );
  return normalizeQualityRecord(rows[0]?.storyboard_set_validation);
}

export function isCurrentStoryboardSetApproval(
  record: StoryboardSetQualityRecord | null,
  storyboards: readonly StoryboardSetEntry[]
) {
  if (record?.policyVersion !== STORYBOARD_SET_QA_POLICY_VERSION || record.validation.status !== "pass") return false;
  const savedUrls = new Map(record.storyboardUrls.map((item) => [item.segmentIndex, item.url]));
  return storyboards.every((storyboard) => savedUrls.get(storyboard.segmentIndex) === storyboard.imageUrl);
}

export async function validateAndSaveGeneratedScriptStoryboardSet(input: {
  scriptId: number;
  storyboards: readonly StoryboardSetEntry[];
  attemptCount: number;
  avatarReferenceUrl?: string | null;
  productName?: string;
  productReferenceUrls?: readonly string[];
  referenceFormatMode?: ReferenceFormatMode;
  wardrobeContinuity?: DirectorWardrobeContinuity;
}) {
  const validation = await validateStoryboardSet({
    storyboards: input.storyboards,
    avatarReferenceUrl: input.avatarReferenceUrl,
    productName: input.productName,
    productReferenceUrls: input.productReferenceUrls,
    referenceFormatMode: input.referenceFormatMode,
    wardrobeContinuity: input.wardrobeContinuity,
  });
  await saveGeneratedScriptStoryboardSetQuality({
    scriptId: input.scriptId,
    storyboards: input.storyboards,
    validation,
    attemptCount: input.attemptCount,
  });
  return validation;
}

export async function saveGeneratedScriptStoryboardSetQuality(input: {
  scriptId: number;
  storyboards: readonly StoryboardSetEntry[];
  validation: StoryboardSetVisionValidation;
  attemptCount: number;
}) {
  const record = buildStoryboardSetQualityRecord({
    validation: input.validation,
    storyboards: input.storyboards,
    attemptCount: input.attemptCount,
  });
  await pool.query(
    `UPDATE omni_generated_scripts
     SET storyboard_set_validation = $2::jsonb,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [input.scriptId, JSON.stringify(record)]
  );
  return record;
}

function normalizeQualityRecord(value: unknown): StoryboardSetQualityRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Partial<StoryboardSetQualityRecord>;
  if (!record.validation || !Array.isArray(record.storyboardUrls)) return null;
  return {
    policyVersion: typeof record.policyVersion === "string" ? record.policyVersion : undefined,
    validation: record.validation,
    storyboardUrls: record.storyboardUrls.filter((item): item is { segmentIndex: number; url: string } =>
      Boolean(item) && Number.isInteger(item.segmentIndex) && typeof item.url === "string" && Boolean(item.url)
    ),
    attemptCount: Number.isInteger(record.attemptCount) ? Number(record.attemptCount) : 0,
    checkedAt: typeof record.checkedAt === "string" ? record.checkedAt : "",
  };
}
