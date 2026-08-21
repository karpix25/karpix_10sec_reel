import pool from "@/lib/db";
import type { StoryboardSetVisionValidation } from "@/lib/omni/storyboard/omni-storyboard-set-vision-types";
import type { OmniStoryboardSegment } from "@/lib/omni/storyboard/omni-storyboard-types";
import {
  getGeneratedScriptStoryboardSetQuality,
  isCurrentStoryboardSetApproval,
  StoryboardSetQualityError,
  validateAndSaveGeneratedScriptStoryboardSet,
} from "./generated-script-storyboard-set-qa";
import { getStoryboardSetRepairSegments } from "./storyboard-set-vision-validator";
import {
  createStoryboardSetRepairState,
  getStoryboardSetRepairProgress,
  normalizeStoryboardSetRepairState,
  type StoryboardSetRepairProgress,
  type StoryboardSetRepairState,
} from "./storyboard-set-repair-state";
import type { ReferenceFormatMode } from "./omni-reference-format-mode";

const MAX_STORYBOARD_SET_QA_ROUNDS = 2;

type StoryboardPromptSegment = {
  index: number;
  storyboardPlan: OmniStoryboardSegment | null;
};

type StoryboardSetEntry = {
  segmentIndex: number;
  imageUrl: string;
  storyboard: OmniStoryboardSegment;
};

export async function ensureGeneratedScriptStoryboardSetApproval(input: {
  scriptId: number;
  referenceSignature: string;
  promptPlan: readonly StoryboardPromptSegment[];
  urls: Map<number, string>;
  productName: string;
  productReferenceUrls: readonly string[];
  referenceFormatMode?: ReferenceFormatMode;
  regenerateTarget: (input: {
    segmentIndex: number;
    validation: StoryboardSetVisionValidation;
    repairProgress: StoryboardSetRepairProgress;
  }) => Promise<string | null>;
}) {
  const plannedStoryboardCount = input.promptPlan.filter((segment) => Boolean(segment.storyboardPlan)).length;
  if (getStoryboardSetEntries(input.promptPlan, input.urls).length !== plannedStoryboardCount) {
    throw new Error("All storyboard images must exist before cross-storyboard QA");
  }

  let state = await getStoryboardSetRepairState(input.scriptId);
  if (state && state.referenceSignature !== input.referenceSignature) {
    await clearStoryboardSetRepairState(input.scriptId);
    state = null;
  }

  const storedQuality = await getGeneratedScriptStoryboardSetQuality(input.scriptId);
  if (!state && isCurrentStoryboardSetApproval(storedQuality, getStoryboardSetEntries(input.promptPlan, input.urls))) return;

  while (true) {
    if (!state) {
      const validation = await validateStoryboardSetRound(input, 1);
      if (validation.status === "pass") return;
      state = createStoryboardSetRepairState({
        referenceSignature: input.referenceSignature,
        qaRound: 1,
        snapshot: getStoryboardSetEntries(input.promptPlan, input.urls).map(({ segmentIndex, imageUrl }) => ({ segmentIndex, url: imageUrl })),
        targetSegments: getRepairTargets(validation, getStoryboardSetEntries(input.promptPlan, input.urls)),
        validation,
      });
      await saveStoryboardSetRepairState(input.scriptId, state);
    }

    const progress = getStoryboardSetRepairProgress(state);
    if (progress) {
      const url = await input.regenerateTarget({
        segmentIndex: progress.segmentIndex,
        validation: state.validation,
        repairProgress: progress,
      });
      if (!url) throw new Error(`Storyboard ${progress.segmentIndex} could not be regenerated for cross-storyboard QA`);
      input.urls.set(progress.segmentIndex, url);
      const resumed = await getStoryboardSetRepairState(input.scriptId);
      if (!resumed) throw new Error("Storyboard set repair state was lost while saving a completed card");
      state = resumed;
      continue;
    }

    const nextQaRound = state.qaRound + 1;
    if (nextQaRound > MAX_STORYBOARD_SET_QA_ROUNDS) {
      await clearStoryboardSetRepairState(input.scriptId);
      throw new StoryboardSetQualityError(state.validation);
    }
    const validation = await validateStoryboardSetRound(input, nextQaRound);
    if (validation.status === "pass") {
      await clearStoryboardSetRepairState(input.scriptId);
      return;
    }
    await clearStoryboardSetRepairState(input.scriptId);
    throw new StoryboardSetQualityError(validation);
  }
}

export async function getStoryboardSetRepairState(scriptId: number) {
  const { rows } = await pool.query<{ storyboard_set_repair_state: unknown }>(
    "SELECT storyboard_set_repair_state FROM omni_generated_scripts WHERE id = $1 LIMIT 1",
    [scriptId]
  );
  return normalizeStoryboardSetRepairState(rows[0]?.storyboard_set_repair_state);
}

export async function saveStoryboardSetRepairState(scriptId: number, state: StoryboardSetRepairState) {
  await pool.query(
    `UPDATE omni_generated_scripts
     SET storyboard_set_repair_state = $2::jsonb,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [scriptId, JSON.stringify(state)]
  );
}

export async function clearStoryboardSetRepairState(scriptId: number) {
  await pool.query(
    `UPDATE omni_generated_scripts
     SET storyboard_set_repair_state = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [scriptId]
  );
}

function getStoryboardSetEntries(promptPlan: readonly StoryboardPromptSegment[], urls: ReadonlyMap<number, string>) {
  return promptPlan.flatMap((segment) => {
    const imageUrl = urls.get(segment.index);
    return segment.storyboardPlan && imageUrl
      ? [{ segmentIndex: segment.index, imageUrl, storyboard: segment.storyboardPlan }]
      : [];
  });
}

async function validateStoryboardSetRound(
  input: Parameters<typeof ensureGeneratedScriptStoryboardSetApproval>[0],
  qaRound: number
) {
  return validateAndSaveGeneratedScriptStoryboardSet({
    scriptId: input.scriptId,
    storyboards: getStoryboardSetEntries(input.promptPlan, input.urls),
    attemptCount: qaRound,
    productName: input.productName,
    productReferenceUrls: input.productReferenceUrls,
    referenceFormatMode: input.referenceFormatMode,
  });
}

function getRepairTargets(validation: StoryboardSetVisionValidation, storyboards: readonly StoryboardSetEntry[]) {
  const repairSegments = getStoryboardSetRepairSegments(validation);
  const allSegments = storyboards.map((storyboard) => storyboard.segmentIndex);
  return repairSegments.length
    ? repairSegments.includes(1) ? allSegments : repairSegments
    : allSegments;
}
