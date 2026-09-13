import { hasForbiddenOmniScriptSymbols } from "./omni-script-text-contract";
import {
  OMNI_MIN_USEFUL_SEGMENT_WORDS,
  OMNI_MIN_SCRIPT_WORDS,
  OMNI_TARGET_SEGMENT_WORDS_MAX,
  describeOmniDensityGap,
  getPreferredOmniSegmentCount,
} from "./omni-speech-density";
import type { OmniDurationRange } from "./omni-duration-range";
import { validateReferenceMeaningCoverage, type ReferenceMeaningCoverage } from "./reference-meaning-contract";
import type { ScriptAdaptationMode } from "./script-adaptation-contract";
import type { CtaMode } from "../../omni/creative-contract";
import { assertOmniCtaContract } from "./omni-cta-contract";
import { hasSpokenProductName } from "./script-semantic-findings";

const FORBIDDEN_SYMBOL_ERROR = "Сценарий отклонен: исходный ответ модели содержит emoji или длинное тире.";
const CTA_SENTENCE_PATTERN = /артикул|описани|коммент|кодово.*слов|ссылк|профил/iu;

export interface ScriptQualityResult {
  score: number;
  passed: boolean;
  warnings: string[];
  metrics: {
    wordCount: number;
    hookWordCount: number;
    hookCharCount: number;
    hasContrast: boolean;
    hasProblem: boolean;
    hasMechanism: boolean;
    productMentioned: boolean;
    slopCount: number;
    ctaAppended: boolean;
    referenceMeaning: ReferenceMeaningCoverage;
  };
}

const SEVERE_SLOP_PHRASES = [
  "в современном мире",
  "стоит отметить",
  "важно понимать",
  "является"
];

const MINOR_SLOP_PHRASES = [
  "уникальный",
  "уникальная",
  "уникальное",
  "уникальные",
  "несомненно",
  "таким образом",
  "прежде всего",
  "следует подчеркнуть",
  "в заключение",
  "исходя из этого",
  "в данной статье",
  "волшебный",
  "секрет раскрыт",
  "секрет успеха"
];

const CHEAP_CLICKBAITS = [
  "не листай",
  "99% людей",
  "секрет, который скрывают",
  "досмотри до конца"
];

const GENERIC_PRODUCT_WORDS = new Set([
  "аэрогриль",
  "бад",
  "витамин",
  "витамины",
  "добавка",
  "желе",
  "капсулы",
  "коллаген",
  "крем",
  "набор",
  "порошок",
  "продукт",
  "сыворотка",
]);

const BROKEN_RUSSIAN_PATTERNS = [
  /(?:^|[^\p{L}\p{N}])(?:такой\s+)?продукт\s+поддержать(?:$|[^\p{L}\p{N}])/iu,
  /(?:^|[^\p{L}\p{N}])(?:он|она|оно|они|это)\s+(?:дать|помочь|поддержать|сделать|сохранить|укрепить|улучшить)(?:$|[^\p{L}\p{N}])/iu,
  /(?:^|[^\p{L}\p{N}])в\s+идеале\s+выбор\s+зависит(?:$|[^\p{L}\p{N}])/iu,
];

const SELF_CLAIMED_EXPERT_PATTERNS = [
  /(?:^|[^\p{L}\p{N}])я\s+(?:врач|доктор|косметолог|нутрициолог|диетолог|эксперт|специалист)(?:$|[^\p{L}\p{N}])/iu,
  /(?:^|[^\p{L}\p{N}])я\s+(?:врач|доктор)[-\s]?(?:косметолог|диетолог)?(?:$|[^\p{L}\p{N}])/iu,
  /(?:^|[^\p{L}\p{N}])как\s+(?:врач|доктор|косметолог|нутрициолог|диетолог|эксперт|специалист)\b/iu,
];

function getSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function extractOpeningHook(text: string) {
  const normalized = text.trim();
  return normalized.match(/^.+?[.!?](?:\s|$)/u)?.[0].trim() || normalized.split(/\s+/u).slice(0, 8).join(" ");
}

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

export function validateViralScriptContract(input: {
  script: string;
  rawScriptBeforeCta: string;
  rawScriptFromModel: string;
  hook: string | null;
  productName: string;
  ctaMode: string;
  ctaValue: string | null;
  durationRange?: OmniDurationRange;
  referenceScript?: string | null;
  adaptationMode?: ScriptAdaptationMode;
}): ScriptQualityResult {
  const warnings: string[] = [];
  const errors = new Set<string>();
  const check = (run: () => unknown) => {
    try { run(); } catch (error) { errors.add(error instanceof Error ? error.message : String(error)); }
  };
  const scriptText = input.script;
  const rawModelScript = input.rawScriptFromModel;
  const normalizedScript = normalizeText(scriptText);
  const normalizedRaw = normalizeText(rawModelScript);

  // 1. Forbidden long dashes and emojis
  check(() => assertGeneratedScriptSymbolContract(rawModelScript));

  // 2. Hook/first sentence check
  const hookToEvaluate = extractOpeningHook(input.hook?.trim() || scriptText);
  const hookWordCount = countWords(hookToEvaluate);
  const hookCharCount = hookToEvaluate.length;

  // Hard fail conditions for hook
  if (hookWordCount > 22 || hookCharCount > 150) {
    warnings.push(
      `Хук или первое предложение длинное (${hookWordCount} слов, ${hookCharCount} симв.). Рекомендуется сократить вступление.`
    );
  }

  if (hookWordCount > 12 || hookCharCount > 80) {
    warnings.push(
      `Хук/первое предложение длинное (${hookWordCount} слов, ${hookCharCount} симв.). Рекомендуется до 12 слов / 80 символов для удержания.`
    );
  }

  // 3. Word count bounds
  const totalWordCount = countWords(scriptText);
  if (totalWordCount < OMNI_MIN_SCRIPT_WORDS) {
    errors.add(
      `Сценарий отклонен: ${describeOmniDensityGap(totalWordCount)}`
    );
  }
  const plannedSegmentCount = getPreferredOmniSegmentCount(totalWordCount);
  if (!plannedSegmentCount) {
    errors.add(`Сценарий отклонен: ${describeOmniDensityGap(totalWordCount)}`);
  }

  const averageWordsPerSegment = plannedSegmentCount ? totalWordCount / plannedSegmentCount : 0;
  if (
    averageWordsPerSegment < OMNI_MIN_USEFUL_SEGMENT_WORDS ||
    averageWordsPerSegment > OMNI_TARGET_SEGMENT_WORDS_MAX
  ) {
    warnings.push(
      `Средняя плотность ${averageWordsPerSegment.toFixed(1)} слов на часть. Цель: ${OMNI_MIN_USEFUL_SEGMENT_WORDS}-${OMNI_TARGET_SEGMENT_WORDS_MAX} слов с авто-длительностью 4/6/8/10 сек.`
    );
  }

  // 4. Severe slop phrases (Hard Fail)
  for (const slop of SEVERE_SLOP_PHRASES) {
    if (normalizedRaw.includes(slop)) {
      warnings.push(
        `Рекомендуется переформулировать фразу "${slop}".`
      );
    }
  }

  const brokenPattern = BROKEN_RUSSIAN_PATTERNS.find((pattern) => pattern.test(normalizedScript));
  if (brokenPattern) {
    errors.add("Сценарий отклонен: текст звучит неграмотно или канцелярски. Перепиши бытовым русским языком без фраз вроде «продукт поддержать».");
  }
  if (SELF_CLAIMED_EXPERT_PATTERNS.some((pattern) => pattern.test(normalizedScript))) {
    errors.add("Сценарий отклонен: нельзя переносить профессиональную роль автора reference на аватара. Убери фразы от первого лица вроде «я врач», «я косметолог», «как эксперт».");
  }
  check(() => assertOmniCtaContract(scriptText, { ctaMode: input.ctaMode as CtaMode, ctaValue: input.ctaValue }));
  const productMentioned = hasSpokenProductName(scriptText, input.productName);
  if (!productMentioned) errors.add(`Сценарий не называет продукт «${input.productName}».`);

  const repeatedDescriptor = findRepeatedProductDescriptor(scriptText, input.productName);
  if (repeatedDescriptor) {
    warnings.push(`Слово продукта «${repeatedDescriptor}» повторяется слишком часто.`);
  }

  if (errors.size) throw new Error([...errors].join("\n"));

  // 5. Minor slop and clickbaits (Warnings)
  let slopCount = 0;
  for (const slop of MINOR_SLOP_PHRASES) {
    if (normalizedScript.includes(slop)) {
      warnings.push(`Обнаружено нежелательное AI-слово/фраза: "${slop}".`);
      slopCount++;
    }
  }

  for (const bait of CHEAP_CLICKBAITS) {
    if (normalizedScript.includes(bait)) {
      warnings.push(`Обнаружен дешевый кликбейт: "${bait}".`);
      slopCount++;
    }
  }

  // Check for "СТОП" as a word (case-insensitive)
  if (/(?<=^|[^a-zA-Zа-яА-ЯёЁ0-9])стоп(?=$|[^a-zA-Zа-яА-ЯёЁ0-9])/ui.test(normalizedScript)) {
    warnings.push(`Обнаружен дешевый кликбейт: "СТОП".`);
    slopCount++;
  }

  // 6. Product relevance check
  // 7. CTA check
  const ctaAppended = input.rawScriptBeforeCta.trim() !== scriptText.trim();
  if (ctaAppended) {
    warnings.push(
      "Изначальный сценарий не содержал обязательного призыва к действию (CTA), призыв был добавлен автоматически."
    );
  }

  // 8. Presence of simple mechanism/contrast/problem signal
  const contrastPattern = /(?<=^|[^a-zA-Zа-яА-ЯёЁ0-9])(но|а|вместо|хотя|однако|зато|напротив)(?=$|[^a-zA-Zа-яА-ЯёЁ0-9])/ui;
  const problemPattern = /(?<=^|[^a-zA-Zа-яА-ЯёЁ0-9])(проблем|ошиб|сложн|устал|бесит|не получается|боль|плох|минус|страх|теряеш|сливаеш|задолбал)/ui;
  const mechanismPattern = /(?<=^|[^a-zA-Zа-яА-ЯёЁ0-9])(как|почему|решен|способ|инструмент|схем|пошагов|секрет|метод|алгоритм|систем|гайд|шаг)/ui;

  const hasContrast = contrastPattern.test(normalizedScript);
  const hasProblem = problemPattern.test(normalizedScript);
  const hasMechanism = mechanismPattern.test(normalizedScript);

  if (!hasContrast && !hasProblem && !hasMechanism) {
    warnings.push(
      "В сценарии не обнаружено сигналов проблемы, контраста или механизма решения. Сюжет может быть плоским."
    );
  }

  const referenceMeaning = validateReferenceMeaningCoverage({
    referenceScript: input.referenceScript,
    generatedScript: scriptText,
    adaptationMode: input.adaptationMode,
  });
  if (!referenceMeaning.passed) {
    warnings.push(
      referenceMeaning.missingSignals.length
        ? `Reference содержит дополнительные смысловые сигналы, которые не перенесены: ${referenceMeaning.missingSignals.slice(0, 6).join(", ")}.`
        : "Сценарий сохранил форму reference, но не все дополнительные смысловые сигналы.",
    );
  }

  // Scoring algorithm (0 to 100)
  let score = 100;
  if (!productMentioned) score -= 15;
  if (!hasContrast && !hasProblem && !hasMechanism) score -= 15;
  if (hookWordCount > 12 || hookCharCount > 80) score -= 15;
  if (
    averageWordsPerSegment < OMNI_MIN_USEFUL_SEGMENT_WORDS ||
    averageWordsPerSegment > OMNI_TARGET_SEGMENT_WORDS_MAX
  ) {
    score -= 10;
  }
  if (ctaAppended) score -= 10;
  score -= Math.min(30, slopCount * 10);

  score = Math.max(0, score);

  return {
    score,
    passed: true,
    warnings,
    metrics: {
      wordCount: totalWordCount,
      hookWordCount,
      hookCharCount,
      hasContrast,
      hasProblem,
      hasMechanism,
      productMentioned,
      slopCount,
      ctaAppended,
      referenceMeaning,
    }
  };
}

export function assertGeneratedScriptSymbolContract(value: string) {
  if (hasForbiddenOmniScriptSymbols(value)) {
    throw new Error(FORBIDDEN_SYMBOL_ERROR);
  }
}

export function assertCtaConclusionContract(script: string, ctaMode: string) {
  if (ctaMode === "no_explicit_cta") return;
  const sentences = getSentences(script);
  let ctaIndex = -1;
  for (let index = sentences.length - 1; index >= 0; index -= 1) {
    if (CTA_SENTENCE_PATTERN.test(sentences[index] || "")) {
      ctaIndex = index;
      break;
    }
  }
  if (ctaMode === "link_in_profile" && ctaIndex >= 0 && !/(?:ссылк|профил)/iu.test(sentences[ctaIndex] || "")) {
    throw new Error("Сценарий отклонен: последний CTA должен вести по ссылке в профиле, без чужого призыва перейти в описание.");
  }
}

function findRepeatedProductDescriptor(script: string, productName: string) {
  const productWords = normalizeWords(productName).filter((word) =>
    word.length >= 7 && !GENERIC_PRODUCT_WORDS.has(word)
  );
  if (!productWords.length) return null;
  const scriptWords = normalizeWords(script);
  for (const word of productWords) {
    const count = scriptWords.filter((item) => item === word).length;
    if (count >= 3) return word;
  }
  return null;
}

function normalizeWords(value: string) {
  return normalizeText(value)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/u)
    .filter(Boolean);
}
