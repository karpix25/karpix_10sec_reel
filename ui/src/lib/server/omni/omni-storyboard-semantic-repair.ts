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
  assertStoryboardPlanSemanticReviewPassed,
  reviewStoryboardPlanSemantics,
  type StoryboardPlanSemanticReview,
  type StoryboardPlanSemanticReviewInput,
} from "./storyboard-plan-semantic-reviewer";
import { parseAndRepairJson } from "./script-json-repair";
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

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_SEMANTIC_REPAIR_ATTEMPTS = 2;

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

  for (let attempt = 0; attempt <= MAX_SEMANTIC_REPAIR_ATTEMPTS; attempt += 1) {
    promptPlan = normalizeOmniPromptPlanWithPhysicalRules({
      promptPlan,
      productName: input.productName,
      productPhysicalContract: input.productPhysicalContract,
      segmentCount: promptPlan.length,
      directorBrief: input.directorBrief,
      referenceSceneMode: input.referenceSceneMode,
    });
    assertPhysicalPromptPlan(promptPlan);
    assertStoryboardPromptContracts(promptPlan, input.productName, input.referenceFormatMode);

    const review = await reviewStoryboardPlanSemantics(buildReviewInput(input, promptPlan, learnedRules));
    if (review.issues.length) {
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
    if (review.passed) return promptPlan;
    if (attempt === MAX_SEMANTIC_REPAIR_ATTEMPTS) {
      assertStoryboardPlanSemanticReviewPassed(review);
    }

    promptPlan = await repairOmniStoryboardPlanWithAi({
      ...input,
      promptPlan,
      review,
      learnedRules,
    });
  }

  throw new Error("Semantic storyboard repair did not return a prompt plan");
}

async function repairOmniStoryboardPlanWithAi(input: {
  promptPlan: readonly OmniSegmentPrompt[];
  script: string;
  productName: string;
  productDescription: string | null;
  productPhysicalContract?: string | null;
  directorBrief: DirectorBrief | null;
  referenceSceneMode: ReferenceSceneMode;
  referenceFormatMode: ReferenceFormatMode;
  model: string;
  review: StoryboardPlanSemanticReview;
  learnedRules: readonly SemanticStoryboardMemoryRule[];
}) {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY?.trim() || ""}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://n8n-omnireels.ap2dy7.easypanel.host",
      "X-Title": "Omni Reels Storyboard Semantic Repair",
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SEMANTIC_REPAIR_SYSTEM_PROMPT },
        { role: "user", content: buildRepairPrompt(input) },
      ],
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Storyboard semantic repair failed: ${response.status} ${text.slice(0, 240)}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const parsed = parseAndRepairJson<unknown>(readAssistantContent(data));
  return applySemanticRepairResponse(input, parsed);
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

function buildReviewInput(
  input: Omit<StoryboardPlanSemanticReviewInput, "segments"> & { promptPlan: readonly OmniSegmentPrompt[] },
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

function applySemanticRepairResponse(input: {
  promptPlan: readonly OmniSegmentPrompt[];
  productName: string;
  productPhysicalContract?: string | null;
  directorBrief: DirectorBrief | null;
  referenceSceneMode: ReferenceSceneMode;
}, value: unknown) {
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
    const voiceoverText = repairedSegment.voiceoverText || segment.voiceoverText;
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

function readAssistantContent(data: Record<string, unknown>) {
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const firstChoice = choices[0];
  const message = isRecord(firstChoice) && isRecord(firstChoice.message) ? firstChoice.message : null;
  if (message && typeof message.content === "string" && message.content.trim()) return message.content;
  throw new Error("Semantic storyboard repair model returned empty content");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
