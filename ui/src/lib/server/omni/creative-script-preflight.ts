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
import type { CreativeSpeechSegment } from "./llm-prompt-chain-types";
import { validateCreativeSpeechPlan } from "./creative-speech-plan";
import { assertReferenceFactsUsed } from "./reference-fact-contract";

export const CREATIVE_SPEECH_PACKING_RULE = [
  `Верни JSON {"segments":[{"duration_seconds":4,"voiceover":"Речь первой группы."},{"duration_seconds":6,"voiceover":"Речь следующей группы."}]}. Весь сценарий состоит из реплик этих 2-${OMNI_MAX_SEGMENT_COUNT} последовательных групп по ${OMNI_MIN_USEFUL_SEGMENT_WORDS}-${getOmniSegmentWordBudget()} произносимых слов. Каждая группа содержит одно или несколько грамматически законченных предложений.`,
  "Длительность каждой группы: 4 секунды для 6-8 слов, 6 секунд для 9-12, 8 секунд для 13-16, 10 секунд для 17-20. Это готовые границы речи, которые режиссер сохранит без изменений. duration_seconds — число JSON; числа внутри реплик записывай словами.",
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
  speechSegments?: readonly CreativeSpeechSegment[];
  requireSpeechSegments?: boolean;
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
  check(() => assertReferenceFactsUsed(input.sourceScenario.script, script));
  check(() => assertPromptChainNumericRangeIntegrity(input.sourceScenario.script, script));
  check(() => assertRussianSpeechGender(script, input.avatarSpeechGender));
  let qualityCheck: ScriptQualityResult | null = null;
  check(() => { qualityCheck = validateCreativeScriptQuality(input, script, context); });
  let segmentPlan: OmniReelSegmentPlan | null = null;
  check(() => {
    if (context.requireSpeechSegments && !context.speechSegments) throw new Error("Верни сценарий как JSON с массивом segments, duration_seconds и voiceover для каждой группы.");
    if (context.speechSegments) {
      try { segmentPlan = validateCreativeSpeechPlan(script, context.speechSegments, input.durationRange); }
      catch (error) {
        // Merge/repack complete sentences without changing one spoken word before asking for a rewrite.
        const joined = context.speechSegments.map((segment) => segment.voiceover.trim()).join(" ");
        if (joined !== script.trim()) throw error;
        try { segmentPlan = planOmniReelSegments(script, { durationRange: input.durationRange, requireSentenceBoundaries: true }); }
        catch { throw error; }
      }
    } else segmentPlan = planOmniReelSegments(script, { durationRange: input.durationRange, requireSentenceBoundaries: true });
  });
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
