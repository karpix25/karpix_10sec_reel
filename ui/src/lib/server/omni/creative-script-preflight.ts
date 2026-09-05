import type { CtaMode } from "../../omni/creative-contract";
import type { OmniAvatarSpeechGender } from "../../omni/avatar-speech-gender";
import type { OmniDurationRange } from "./omni-duration-range";
import type { ScriptAdaptationMode } from "./script-adaptation-contract";
import { formatPromptChainNumber } from "./llm-prompt-chain-number-words";
import { assertOmniScriptTextContract } from "./omni-script-text-contract";
import { assertRussianSpeechGender } from "./russian-speech-gender-contract";
import { validateViralScriptContract, type ScriptQualityResult } from "./script-quality-contract";
import { splitScriptIntoSentences } from "./omni-script-segmentation";
import { planOmniReelSegments, type OmniReelSegmentPlan } from "./omni-duration-planner";
import { OMNI_MAX_SEGMENT_COUNT, OMNI_MIN_USEFUL_SEGMENT_WORDS, getOmniSegmentWordBudget } from "./omni-speech-density";

export const CREATIVE_SPEECH_PACKING_RULE = [
  `Перед ответом собери весь voiceover в 2-${OMNI_MAX_SEGMENT_COUNT} последовательных групп по ${OMNI_MIN_USEFUL_SEGMENT_WORDS}-${getOmniSegmentWordBudget()} произносимых слов. Каждая группа содержит одно или несколько грамматически законченных предложений.`,
  `Отдельное предложение не длиннее ${getOmniSegmentWordBudget()} слов, включая полное название продукта и числа, записанные словами. Короткий CTA объединяй в одну группу с соседним законченным предложением, сохраняя точку между ними.`,
  "Проверь весь план: простое разбиение длинного предложения на два еще не гарантирует, что все группы помещаются. Если групп слишком много, переформулируй или сократи второстепенные детали, сохранив обязательные факты, переход к продукту, его пользу и CTA.",
  "Не разрезай незаконченную фразу, не ускоряй произношение и не добавляй пустые слова. Ориентир речи: четыре слова на две секунды; граница кадра и склейка не требуют паузы.",
].join(" ");

export type CreativeScriptPreflight = {
  issues: string[];
  segmentPlan: OmniReelSegmentPlan | null;
  qualityCheck: ScriptQualityResult | null;
  sentences: Array<{ index: number; text: string; wordCount: number }>;
};

export type CreativeScriptQualityContext = {
  hook?: string | null;
  rawScriptBeforeCta?: string;
  rawScriptFromModel?: string;
};

type CreativeScriptPreflightInput = {
  productName: string;
  ctaMode: CtaMode;
  ctaValue: string | null;
  durationRange?: OmniDurationRange;
  sourceScenario: { script: string };
  avatarSpeechGender: OmniAvatarSpeechGender;
  adaptationPlan: { mode: ScriptAdaptationMode };
};

export function validateCreativeScriptQuality(input: CreativeScriptPreflightInput, script: string, context: CreativeScriptQualityContext = {}) {
  return validateViralScriptContract({
    script, rawScriptBeforeCta: context.rawScriptBeforeCta ?? script,
    rawScriptFromModel: context.rawScriptFromModel ?? script, hook: context.hook ?? null,
    productName: input.productName, ctaMode: input.ctaMode, ctaValue: input.ctaValue,
    durationRange: input.durationRange, referenceScript: input.sourceScenario.script,
    adaptationMode: input.adaptationPlan.mode,
  });
}

export function collectCreativeScriptPreflight(input: CreativeScriptPreflightInput, script: string, context: CreativeScriptQualityContext = {}): CreativeScriptPreflight {
  const issues = new Set<string>();
  const check = (run: () => unknown) => {
    try { run(); } catch (error) { issues.add(error instanceof Error ? error.message : String(error)); }
  };
  check(() => assertOmniScriptTextContract(script));
  check(() => assertPromptChainNumericRangeIntegrity(input.sourceScenario.script, script));
  check(() => assertRussianSpeechGender(script, input.avatarSpeechGender));
  let qualityCheck: ScriptQualityResult | null = null;
  check(() => { qualityCheck = validateCreativeScriptQuality(input, script, context); });
  let segmentPlan: OmniReelSegmentPlan | null = null;
  check(() => { segmentPlan = planOmniReelSegments(script, { durationRange: input.durationRange, requireSentenceBoundaries: true }); });
  return {
    issues: [...issues], segmentPlan, qualityCheck,
    sentences: splitScriptIntoSentences(script).map((sentence, index) => ({ ...sentence, index: index + 1 })),
  };
}

export class CreativeScriptValidationError extends Error {
  constructor(readonly report: CreativeScriptPreflight, readonly script: string, readonly issues: string[]) {
    super(`Сценарий отклонен: ${issues.join("\n")}`);
    this.name = "CreativeScriptValidationError";
  }
}

export function renderCreativeScriptPreflight(report: CreativeScriptPreflight): string {
  return [
    "Проверка именно этого черновика:",
    ...report.issues.map((issue) => `- ${issue}`),
    report.segmentPlan
      ? "Разбиение уже проверено. При смысловой правке сохрани пригодные группы и их границы; меняй только затронутую мысль. Не объединяй группы в длинное предложение."
      : "Разбиение не прошло. Исправь длину и границы предложений во всем плане; не переписывай тему и не удаляй причинный переход ради тайминга.",
    ...(report.segmentPlan?.segments.map((segment, index) =>
      `Группа ${index + 1}, ${report.segmentPlan!.segmentDurationsSeconds[index]} секунд, ${segment.wordCount} слов: ${segment.text}`,
    ) || []),
    "Предложения по порядку (числа ниже служебные, не произносить):",
    ...report.sentences.map((sentence) => `Предложение ${sentence.index}, ${sentence.wordCount} слов: ${sentence.text}`),
  ].join("\n");
}

export function assertPromptChainNumericRangeIntegrity(referenceScript: string, script: string) {
  const normalizedScript = script.toLocaleLowerCase("ru-RU");
  const pattern = /(?<!\d)(?:от\s+)?(\d{1,3}(?:[\u00A0\u202F ]\d{3})*)\s*(?:[-‐‑‒–—―−]|до)\s*(\d{1,3}(?:[\u00A0\u202F ]\d{3})*)(?!\d)/giu;
  for (const match of referenceScript.matchAll(pattern)) {
    const min = match[1].replace(/[\s\u00A0\u202F]/gu, "");
    const max = match[2].replace(/[\s\u00A0\u202F]/gu, "");
    if (!Number.isSafeInteger(Number(min)) || !Number.isSafeInteger(Number(max))) continue;
    if (normalizedScript.includes(formatPromptChainNumber(Number(`${min}${max}`)))) {
      throw new Error(`Сценарий схлопнул числовой диапазон ${min}-${max} в ${min}${max}; черновик нельзя сохранять.`);
    }
  }
}
