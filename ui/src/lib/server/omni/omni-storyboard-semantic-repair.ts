import { createHash } from "node:crypto";
import type { OmniStoryboardFrame, OmniStoryboardSegment } from "@/lib/omni/storyboard/omni-storyboard-types";
import { normalizeOmniStoryboardSpeech, validateOmniStoryboardSegment } from "@/lib/omni/storyboard/omni-storyboard-contract";
import type { OmniSegmentPrompt } from "./omni-prompt-builder";
import type { DirectorBrief } from "./director-analysis-types";
import { applyReferenceSceneModeToOmniPrompt, type ReferenceSceneMode } from "./omni-reference-scene-mode";
import { resolveDirectorVisibleSubjectPolicy } from "./director-visibility-policy";
import { renderReferenceSegmentPlanForPrompt } from "./reference-segment-plan";
import { repairPhysicalScenePrompt, validatePhysicalScene } from "./physical-scene-validator";
import { renderCompactRussianOmniStoryboardPrompt } from "./storyboard/omni-storyboard-renderer";
import {
  reviewStoryboardPlanSemantics,
  type StoryboardPlanSemanticReview,
  type StoryboardPlanSemanticReviewInput,
} from "./storyboard-plan-semantic-reviewer";
import { requestSemanticStoryboardJson } from "./omni-storyboard-semantic-llm";
import { normalizeOmniPromptPlanWithPhysicalRules } from "./omni-physical-repair-pipeline";
import { assertPhysicalPromptPlan } from "./physical-scene-validator";
import { assertStoryboardPromptContracts } from "./storyboard/storyboard-contract-validator";
import type { ReferenceFormatMode } from "./omni-reference-format-mode";
import {
  loadSemanticStoryboardMemory,
  rememberSemanticStoryboardIssues,
} from "./semantic-storyboard-memory";
import {
  renderSemanticStoryboardMemoryRules,
  type SemanticStoryboardMemoryRule,
} from "./semantic-storyboard-memory-contract";
import {
  beginFinalSemanticReview,
  beginFullSemanticRebuild,
  consumeSemanticRepairLlmCall,
  createStoryboardSemanticRepairState,
  formatSemanticRepairFailure,
  fingerprintStoryboardPlan,
  MAX_LOCAL_SEMANTIC_REPAIR_ATTEMPTS,
  recordLocalSemanticRepair,
  type StoryboardSemanticRepairState,
} from "./storyboard-semantic-repair-state";

type SemanticRepairSegment = {
  index: number;
  voiceoverText?: string;
  storyboardPlan: unknown;
};

export async function prepareOmniPromptPlanWithSemanticRepair(input: {
  projectId: number;
  productId: number;
  promptPlan: readonly OmniSegmentPrompt[];
  script: string;
  productName: string;
  productDescription: string | null;
  productPhysicalContract?: string | null;
  directorBrief: DirectorBrief | null;
  referenceSceneMode: ReferenceSceneMode;
  referenceFormatMode: ReferenceFormatMode;
  model: string;
}) {
  let promptPlan = [...input.promptPlan];
  const learnedRules = await loadSemanticStoryboardMemory({
    projectId: input.projectId,
    productId: input.productId,
    referenceFormatMode: input.referenceFormatMode,
    referenceSceneMode: input.referenceSceneMode,
  });
  const state = createStoryboardSemanticRepairState();
  let review: StoryboardPlanSemanticReview | null = null;

  for (let attempt = 0; attempt <= MAX_LOCAL_SEMANTIC_REPAIR_ATTEMPTS; attempt += 1) {
    promptPlan = validateSemanticPromptPlan(input, promptPlan);

    consumeSemanticRepairLlmCall(state);
    review = await reviewStoryboardPlanSemantics(buildReviewInput(input, promptPlan, learnedRules));
    if (review.passed) return promptPlan;
    if (attempt === MAX_LOCAL_SEMANTIC_REPAIR_ATTEMPTS) break;

    consumeSemanticRepairLlmCall(state);
    try {
      promptPlan = await repairOmniStoryboardPlanWithAi({ ...input, promptPlan, review, learnedRules });
    } catch (error) {
      recordLocalSemanticRepair(state);
      return rebuildAfterLocalRepairFailure({ ...input, learnedRules }, promptPlan, review, state, error);
    }
    recordLocalSemanticRepair(state);
  }

  return rebuildAfterLocalRepairFailure({ ...input, learnedRules }, promptPlan, review, state, null);
}

type SemanticRepairContext = {
  projectId: number;
  productId: number;
  script: string;
  productName: string;
  productDescription: string | null;
  productPhysicalContract?: string | null;
  directorBrief: DirectorBrief | null;
  referenceSceneMode: ReferenceSceneMode;
  referenceFormatMode: ReferenceFormatMode;
  model: string;
  learnedRules: readonly SemanticStoryboardMemoryRule[];
};

function rememberSemanticFailure(input: SemanticRepairContext, review: StoryboardPlanSemanticReview) {
  if (!review.issues.length) return;
  void rememberSemanticStoryboardIssues({
    scope: {
      projectId: input.projectId,
      productId: input.productId,
      referenceFormatMode: input.referenceFormatMode,
      referenceSceneMode: input.referenceSceneMode,
    },
    issues: review.issues,
    repairInstructions: review.repairInstructions,
  });
}

async function rebuildAfterLocalRepairFailure(
  input: SemanticRepairContext,
  promptPlan: readonly OmniSegmentPrompt[],
  review: StoryboardPlanSemanticReview | null,
  state: StoryboardSemanticRepairState,
  localRepairError: unknown,
) {
  if (!review) throw new Error("Storyboard semantic self-healing stopped without a semantic review");

  const rebuildInputFingerprint = fingerprintStoryboardPlan(promptPlan);
  if (!beginFullSemanticRebuild(state, rebuildInputFingerprint)) {
    rememberSemanticFailure(input, review);
    throwSemanticRepairExhausted(review, state, ["storyboard_rebuild_repeated"]);
  }

  consumeSemanticRepairLlmCall(state);
  let rebuiltPlan: readonly OmniSegmentPrompt[];
  try {
    rebuiltPlan = await rebuildOmniStoryboardPlanWithAi({
      ...input,
      promptPlan,
      review,
      learnedRules: input.learnedRules,
    });
  } catch (error) {
    rememberSemanticFailure(input, review);
    throw new Error(formatSemanticRepairFailure(state, [
      "storyboard_full_rebuild_failed",
      ...(localRepairError ? ["storyboard_local_repair_failed"] : []),
    ], errorMessage(error)));
  }

  let validatedPlan: readonly OmniSegmentPrompt[];
  try {
    validatedPlan = validateSemanticPromptPlan(input, rebuiltPlan);
  } catch (error) {
    rememberSemanticFailure(input, review);
    throw new Error(formatSemanticRepairFailure(state, ["storyboard_full_rebuild_invalid"], errorMessage(error)));
  }
  const rebuildOutputFingerprint = fingerprintStoryboardPlan(validatedPlan);
  beginFinalSemanticReview(state);
  consumeSemanticRepairLlmCall(state);
  let rebuiltReview: StoryboardPlanSemanticReview;
  try {
    rebuiltReview = await reviewStoryboardPlanSemantics(buildReviewInput(input, validatedPlan, input.learnedRules));
  } catch (error) {
    rememberSemanticFailure(input, review);
    throw new Error(formatSemanticRepairFailure(state, ["storyboard_final_semantic_review_failed"], errorMessage(error)));
  }
  if (rebuiltReview.passed) return validatedPlan;
  rememberSemanticFailure(input, rebuiltReview);
  throwSemanticRepairExhausted(
    rebuiltReview,
    state,
    rebuildInputFingerprint === rebuildOutputFingerprint ? ["storyboard_rebuild_no_change"] : [],
  );
}

type SemanticRepairInput = SemanticRepairContext & {
  promptPlan: readonly OmniSegmentPrompt[];
  review: StoryboardPlanSemanticReview;
};

async function repairOmniStoryboardPlanWithAi(input: SemanticRepairInput) {
  const parsed = await requestSemanticStoryboardJson({
    model: input.model,
    systemPrompt: SEMANTIC_REPAIR_SYSTEM_PROMPT,
    userPrompt: buildRepairPrompt(input),
    title: "Omni Reels Storyboard Semantic Repair",
  });
  return applySemanticRepairResponse(input, parsed);
}

async function rebuildOmniStoryboardPlanWithAi(input: SemanticRepairInput) {
  const expectedFingerprint = voiceoverFingerprint(input.promptPlan.map((segment) => segment.voiceoverText));
  const sourceFingerprint = voiceoverFingerprint([input.script]);
  if (expectedFingerprint !== sourceFingerprint) {
    throw new Error("Full storyboard rebuild refused: source voiceover fingerprint does not match the local plan");
  }

  const parsed = await requestSemanticStoryboardJson({
    model: input.model,
    systemPrompt: SEMANTIC_REBUILD_SYSTEM_PROMPT,
    userPrompt: buildFullRebuildPrompt(input),
    title: "Omni Reels Storyboard Semantic Full Rebuild",
  });
  const segments = readFullRebuildSegments(parsed, input.promptPlan.map((segment) => segment.index));
  const rebuiltPlan = applySemanticRepairResponse(input, { segments }, "full_rebuild");
  if (voiceoverFingerprint(rebuiltPlan.map((segment) => segment.voiceoverText)) !== expectedFingerprint) {
    throw new Error("Full storyboard rebuild changed the source voiceover fingerprint");
  }
  return rebuiltPlan;
}

const SEMANTIC_REPAIR_SYSTEM_PROMPT = [
  "Ты исправляешь раскадровку короткого видео после строгой смысловой проверки.",
  "Верни только JSON формата {segments:[{index:number,storyboardPlan:{segmentIndex:number,durationSeconds:number,voiceoverText:string,frames:[{visualAction:string,camera:string,environment:string,wardrobe:string,productPlacement:string,sfxNotes:string,effectNotes?:string|null,speechMode?:string}]} }]}.",
  "Верни только сегменты, которые нужно изменить. Сохрани segmentIndex, durationSeconds и количество кадров.",
  "При необходимости добавь voiceoverText на уровне сегмента и в storyboardPlan, чтобы перераспределить существующие слова между сегментами; итоговая последовательность слов должна остаться прежней.",
  "Не добавляй и не удаляй слова из исходного сценария. Если финалу не хватает тезиса, разрешено только перераспределить существующие слова между соседними сегментами и кадрами.",
  "Исправляй визуальную режиссуру, композицию, формат reference, финальное раскрытие тезиса и интеграцию продукта; не добавляй новые утверждения.",
  "Текущий режиссерский анализ reference и product contract имеют приоритет над scoped learned memory; learned memory только дополняет их.",
  "Для voiceover_montage с visible_subject_policy=no_people используй самостоятельные пейзажные, предметные, food и product-UI B-roll кадры с voiceover_only.",
  "Для финального сегмента покажи визуальное завершение главной мысли; CTA не должен быть единственным содержанием кадра.",
  "Сохрани положительный визуальный план reference и меняй только то, на что указывает semantic review.",
].join(" ");

const SEMANTIC_REBUILD_SYSTEM_PROMPT = [
  "Ты полностью пересобираешь раскадровку короткого видео после неудачной локальной смысловой правки.",
  "Верни только JSON формата {segments:[{index:number,voiceoverText:string,storyboardPlan:{segmentIndex:number,durationSeconds:number,voiceoverText:string,frames:[{visualAction:string,camera:string,environment:string,wardrobe:string,productPlacement:string,sfxNotes:string,effectNotes?:string|null,speechMode?:string}]}}]}.",
  "Верни каждый сегмент текущего плана ровно один раз, в том же порядке, с тем же segmentIndex, durationSeconds и количеством кадров.",
  "Не меняй и не перефразируй voiceoverText. Сохрани исходную последовательность слов побуквенно после нормализации.",
  "Пересобери визуальную режиссуру целиком с учетом semantic review, reference format и физических контрактов.",
  "Не добавляй и не удаляй слова, сегменты или кадры. Не добавляй новые утверждения.",
].join(" ");

function buildReviewInput(
  input: Omit<StoryboardPlanSemanticReviewInput, "segments">,
  promptPlan: readonly OmniSegmentPrompt[],
  learnedRules: readonly SemanticStoryboardMemoryRule[],
): StoryboardPlanSemanticReviewInput {
  return {
    model: input.model,
    script: input.script,
    productName: input.productName,
    productDescription: input.productDescription,
    productPhysicalContract: input.productPhysicalContract,
    directorBrief: input.directorBrief,
    referenceSceneMode: input.referenceSceneMode,
    referenceFormatMode: input.referenceFormatMode,
    learnedRules,
    segments: promptPlan.map((segment) => ({
      index: segment.index,
      voiceoverText: segment.voiceoverText,
      productRole: segment.creativePlan.productRole,
      storyboardPlan: segment.storyboardPlan,
    })),
  };
}

function buildRepairPrompt(input: {
  promptPlan: readonly OmniSegmentPrompt[];
  script: string;
  productName: string;
  productDescription: string | null;
  productPhysicalContract?: string | null;
  directorBrief: DirectorBrief | null;
  referenceSceneMode: ReferenceSceneMode;
  referenceFormatMode: ReferenceFormatMode;
  review: StoryboardPlanSemanticReview;
  learnedRules: readonly SemanticStoryboardMemoryRule[];
}) {
  return [
    `Продукт: ${input.productName}`,
    `Описание продукта: ${input.productDescription || "не указано"}`,
    `Текущий product contract, обязательный источник правды: ${input.productPhysicalContract || "не указан"}`,
    `Reference scene mode: ${input.referenceSceneMode}`,
    `Reference format mode: ${input.referenceFormatMode}`,
    "Текущий режиссерский анализ reference, обязательный источник правды:",
    JSON.stringify(input.directorBrief || {}, null, 2),
    renderSemanticStoryboardMemoryRules(input.learnedRules),
    "Исходный сценарий:",
    input.script,
    "Найденные semantic issues:",
    JSON.stringify({ issues: input.review.issues, repairInstructions: input.review.repairInstructions }, null, 2),
    "Текущий план сегментов:",
    JSON.stringify(input.promptPlan.map((segment) => ({
      index: segment.index,
      voiceoverText: segment.voiceoverText,
      storyboardPlan: segment.storyboardPlan,
    })), null, 2),
  ].join("\n\n");
}

function buildFullRebuildPrompt(input: SemanticRepairInput) {
  return [
    "РЕЖИМ: ПОЛНАЯ ПЕРЕСБОРКА. Верни все сегменты, а не только измененные.",
    buildRepairPrompt(input),
    "Проверка перед ответом: voiceover каждого сегмента и storyboardPlan.voiceoverText должны сохранить исходную последовательность слов; durationSeconds и число frames должны совпасть с текущим планом.",
  ].join("\n\n");
}

function validateSemanticPromptPlan(
  input: Pick<SemanticRepairInput, "productName" | "productPhysicalContract" | "directorBrief" | "referenceSceneMode" | "referenceFormatMode">,
  promptPlan: readonly OmniSegmentPrompt[],
) {
  const normalizedPlan = normalizeOmniPromptPlanWithPhysicalRules({
    promptPlan,
    productName: input.productName,
    productPhysicalContract: input.productPhysicalContract,
    segmentCount: promptPlan.length,
    directorBrief: input.directorBrief,
    referenceSceneMode: input.referenceSceneMode,
  });
  assertPhysicalPromptPlan(normalizedPlan);
  assertStoryboardPromptContracts(normalizedPlan, input.productName, {
    wardrobeContinuity: input.directorBrief?.wardrobe_continuity || "unknown",
  });
  return normalizedPlan;
}

function applySemanticRepairResponse(input: {
  promptPlan: readonly OmniSegmentPrompt[];
  productName: string;
  productPhysicalContract?: string | null;
  directorBrief: DirectorBrief | null;
  referenceSceneMode: ReferenceSceneMode;
}, value: unknown, mode: "local_repair" | "full_rebuild" = "local_repair") {
  const segments = readRepairSegments(value);
  const byIndex = new Map(segments.map((segment) => [segment.index, segment]));
  const repairedVoiceover = input.promptPlan
    .map((segment) => byIndex.get(segment.index)?.voiceoverText || segment.voiceoverText)
    .join(" ");
  const originalVoiceover = input.promptPlan.map((segment) => segment.voiceoverText).join(" ");
  if (normalizeOmniStoryboardSpeech(repairedVoiceover) !== normalizeOmniStoryboardSpeech(originalVoiceover)) {
    throw new Error("Semantic storyboard repair changed the source voiceover words");
  }

  return input.promptPlan.map((segment) => {
    const repairedSegment = byIndex.get(segment.index);
    if (!repairedSegment || !segment.storyboardPlan) return segment;
    const voiceoverText = mode === "full_rebuild" ? segment.voiceoverText : repairedSegment.voiceoverText || segment.voiceoverText;
    if (mode === "full_rebuild" && repairedSegment.voiceoverText && normalizeOmniStoryboardSpeech(repairedSegment.voiceoverText) !== normalizeOmniStoryboardSpeech(segment.voiceoverText)) {
      throw new Error(`Full storyboard rebuild changed segment ${segment.index} voiceover text`);
    }
    const storyboard = mergeRepairedStoryboard(segment.storyboardPlan, repairedSegment.storyboardPlan, voiceoverText);
    const storyboardValidation = validateOmniStoryboardSegment(storyboard);
    if (!storyboardValidation.valid) {
      throw new Error(`Semantic storyboard repair returned invalid segment ${segment.index}: ${storyboardValidation.errors.join(", ")}`);
    }
    const validation = validatePhysicalScene({
      storyboard,
      creativePlan: segment.creativePlan,
      productName: input.productName,
    });
    const renderedPrompt = renderCompactRussianOmniStoryboardPrompt({
      storyboard,
      productName: input.productName,
      productPhysicalContract: segment.creativePlan.productRole !== "hidden"
        ? input.productPhysicalContract
        : null,
      productRole: segment.creativePlan.productRole,
      segmentCount: input.promptPlan.length,
      directorBrief: input.directorBrief,
      referenceSceneMode: input.referenceSceneMode,
    });
    const prompt = applyReferenceSceneModeToOmniPrompt(
      repairPhysicalScenePrompt(renderedPrompt, validation),
      input.referenceSceneMode,
      resolveDirectorVisibleSubjectPolicy(input.directorBrief),
    );
    return {
      ...segment,
      voiceoverText,
      creativePlan: {
        ...segment.creativePlan,
        voiceoverText,
      },
      prompt: [prompt, renderReferenceSegmentPlanForPrompt(segment.referenceSegmentPlan)]
        .filter(Boolean)
        .join("\n\n"),
      storyboardPlan: storyboard,
      storyboardValidation,
      validation,
    };
  });
}

function mergeRepairedStoryboard(original: OmniStoryboardSegment, value: unknown, voiceoverText: string): OmniStoryboardSegment {
  if (!isRecord(value) || !Array.isArray(value.frames)) {
    throw new Error("Semantic storyboard repair returned an invalid storyboard");
  }
  if (value.segmentIndex !== original.segmentIndex || value.durationSeconds !== original.durationSeconds) {
    throw new Error("Semantic storyboard repair changed segment identity or duration");
  }
  if (value.frames.length !== original.frames.length) {
    throw new Error("Semantic storyboard repair changed the storyboard frame count");
  }
  const storyboardVoiceover = typeof value.voiceoverText === "string" ? value.voiceoverText : voiceoverText;
  if (normalizeOmniStoryboardSpeech(storyboardVoiceover) !== normalizeOmniStoryboardSpeech(voiceoverText)) {
    throw new Error("Semantic storyboard repair changed the voiceover text");
  }
  return {
    ...original,
    voiceoverText,
    frames: value.frames.map((frame, index) => mergeRepairedFrame(original.frames[index], frame)),
  };
}

function mergeRepairedFrame(original: OmniStoryboardFrame, value: unknown): OmniStoryboardFrame {
  if (!isRecord(value)) throw new Error("Semantic storyboard repair returned an invalid frame");
  const allowedFields = new Set([
    "spokenText",
    "visualAction",
    "camera",
    "environment",
    "wardrobe",
    "productPlacement",
    "sfxNotes",
    "effectNotes",
    "modelMusicNotes",
    "speechMode",
  ]);
  if (Object.keys(value).some((key) => !allowedFields.has(key))) {
    throw new Error("Semantic storyboard repair attempted to change a protected storyboard field");
  }
  return {
    ...original,
    ...value,
    spokenText: original.spokenText,
  } as OmniStoryboardFrame;
}

function readRepairSegments(value: unknown): SemanticRepairSegment[] {
  if (!isRecord(value) || !Array.isArray(value.segments) || !value.segments.length) {
    throw new Error("Semantic storyboard repair returned no segments");
  }
  const seen = new Set<number>();
  return value.segments.map((segment) => {
    if (!isRecord(segment) || typeof segment.index !== "number" || !Number.isInteger(segment.index) || seen.has(segment.index)) {
      throw new Error("Semantic storyboard repair returned an invalid segment index");
    }
    seen.add(segment.index);
    if (!("storyboardPlan" in segment)) throw new Error(`Semantic storyboard repair omitted segment ${segment.index}`);
    return {
      index: segment.index,
      voiceoverText: typeof segment.voiceoverText === "string" ? segment.voiceoverText : undefined,
      storyboardPlan: segment.storyboardPlan,
    };
  });
}

function readFullRebuildSegments(value: unknown, expectedIndexes: readonly number[]) {
  const segments = readRepairSegments(value);
  if (segments.length !== expectedIndexes.length) {
    throw new Error(`Full storyboard rebuild returned ${segments.length} segments; expected ${expectedIndexes.length}`);
  }
  const indexes = new Set(segments.map((segment) => segment.index));
  for (const index of expectedIndexes) {
    if (!indexes.has(index)) throw new Error(`Full storyboard rebuild omitted segment ${index}`);
  }
  return segments;
}

function voiceoverFingerprint(parts: readonly string[]) {
  return createHash("sha256")
    .update(normalizeOmniStoryboardSpeech(parts.join(" ")))
    .digest("hex");
}

function throwSemanticRepairExhausted(
  review: StoryboardPlanSemanticReview,
  state: StoryboardSemanticRepairState,
  extraIssueCodes: readonly string[] = [],
): never {
  const issueCodes = [...new Set([
    ...extraIssueCodes,
    ...review.issues.map((issue) => issue.code),
  ])];
  const details = review.issues.length
    ? review.issues.map((issue) => `segment ${issue.segmentIndex}: ${issue.explanation}`).join("; ")
    : "semantic reviewer rejected the storyboard without structured issue details";
  throw new Error(formatSemanticRepairFailure(
    state,
    issueCodes.length ? issueCodes : ["storyboard_semantic_failure"],
    details,
  ));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
