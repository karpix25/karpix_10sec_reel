import { hasForbiddenOmniScriptSymbols } from "./omni-script-text-contract";

const FORBIDDEN_SYMBOL_ERROR = "Сценарий отклонен: исходный ответ модели содержит emoji или длинное тире.";

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

function getSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
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
}): ScriptQualityResult {
  const warnings: string[] = [];
  const scriptText = input.script;
  const rawModelScript = input.rawScriptFromModel;
  const normalizedScript = normalizeText(scriptText);
  const normalizedRaw = normalizeText(rawModelScript);

  // 1. Forbidden long dashes and emojis
  assertGeneratedScriptSymbolContract(rawModelScript);

  // 2. Hook/first sentence check
  const firstSentence = getSentences(scriptText)[0] || "";
  const hookToEvaluate = input.hook?.trim() || firstSentence;
  const hookWordCount = countWords(hookToEvaluate);
  const hookCharCount = hookToEvaluate.length;

  // Hard fail conditions for hook
  if (hookWordCount > 22 || hookCharCount > 150) {
    throw new Error(
      `Сценарий отклонен: хук или первое предложение слишком длинное для Reels (${hookWordCount} слов, ${hookCharCount} симв.). Сценарий должен начинаться динамично.`
    );
  }

  if (hookWordCount > 12 || hookCharCount > 80) {
    warnings.push(
      `Хук/первое предложение длинное (${hookWordCount} слов, ${hookCharCount} симв.). Рекомендуется до 12 слов / 80 символов для удержания.`
    );
  }

  // 3. Word count bounds
  const totalWordCount = countWords(scriptText);
  if (totalWordCount < 36) {
    throw new Error(
      `Сценарий отклонен: слишком короткий (${totalWordCount} слов). Минимальная длина — 36 слов, иначе Omni растягивает паузы и лишние действия.`
    );
  }
  if (totalWordCount > 120) {
    throw new Error(
      `Сценарий отклонен: слишком длинный для формата Reels (${totalWordCount} слов). Максимальная длина — 120 слов.`
    );
  }

  if (totalWordCount < 46 || totalWordCount > 88) {
    warnings.push(
      `Длина сценария (${totalWordCount} слов) вне рекомендованных рамок 46-88 слов для плотной речи без пауз.`
    );
  }

  // 4. Severe slop phrases (Hard Fail)
  for (const slop of SEVERE_SLOP_PHRASES) {
    if (normalizedRaw.includes(slop)) {
      throw new Error(
        `Сценарий отклонен: содержит запрещенное AI-слово/фразу "${slop}".`
      );
    }
  }

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
  const normalizedProduct = normalizeText(input.productName);
  let productMentioned = normalizedScript.includes(normalizedProduct);

  if (!productMentioned) {
    // Try word-by-word partial matching for words with length >= 4
    const productWords = normalizedProduct
      .split(/[^a-zA-Zа-яА-Я0-9]+/u)
      .filter((w) => w.length >= 4);

    if (productWords.length > 0) {
      productMentioned = productWords.some((word) =>
        normalizedScript.includes(word.slice(0, Math.max(4, word.length - 2)))
      );
    }
  }

  if (!productMentioned) {
    warnings.push(
      `Продукт "${input.productName}" не упомянут напрямую в тексте сценария. Убедитесь, что продукт продвигается.`
    );
  }

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

  // Scoring algorithm (0 to 100)
  let score = 100;
  if (!productMentioned) score -= 15;
  if (!hasContrast && !hasProblem && !hasMechanism) score -= 15;
  if (hookWordCount > 12 || hookCharCount > 80) score -= 15;
  if (totalWordCount < 35 || totalWordCount > 90) score -= 15;
  if (ctaAppended) score -= 10;
  score -= Math.min(30, slopCount * 10);

  score = Math.max(0, score);

  return {
    score,
    passed: score >= 50,
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
      ctaAppended
    }
  };
}

export function assertGeneratedScriptSymbolContract(value: string) {
  if (hasForbiddenOmniScriptSymbols(value)) {
    throw new Error(FORBIDDEN_SYMBOL_ERROR);
  }
}
