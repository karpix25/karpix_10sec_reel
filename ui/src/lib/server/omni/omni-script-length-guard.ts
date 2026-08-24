import { countOmniScriptWords } from "./omni-duration-planner";
import { buildReferenceMeaningContract } from "./reference-meaning-contract";

const CTA_PATTERN = /артикул|описани|коммент|кодово.*слов|ссылк|профил/iu;

export function compactOmniScriptToWordBudget(
  script: string,
  maxWords: number,
  options: { referenceScript?: string | null } = {}
) {
  if (countOmniScriptWords(script) <= maxWords) return script;

  const sentences = splitSentences(script);
  const protectedMeaningSignals = buildReferenceMeaningContract(options.referenceScript || "").criticalSignals;
  while (countWords(sentences) > maxWords) {
    const overflow = countWords(sentences) - maxWords;
    const ctaIndex = findLastCtaSentence(sentences);
    const conclusionIndex = ctaIndex >= 0 && ctaIndex < sentences.length - 1 ? ctaIndex + 1 : -1;
    const removable = sentences
      .map((sentence, index) => ({ sentence, index, words: countOmniScriptWords(sentence) }))
      .filter(({ index, sentence }) =>
        index !== 0
        && index !== ctaIndex
        && index !== conclusionIndex
        && !containsReferenceMeaningSignal(sentence, protectedMeaningSignals)
      );
    const candidate = removable
      .filter(({ words }) => words >= overflow)
      .sort((left, right) => left.words - right.words)[0] || removable.sort((left, right) => right.index - left.index)[0];
    if (!candidate) return sentences.join(" ").replace(/\s+/g, " ").trim();
    sentences.splice(candidate.index, 1);
  }

  const compacted = sentences.join(" ").replace(/\s+/g, " ").trim();
  return trimFinalSentence(compacted, maxWords);
}

function containsReferenceMeaningSignal(sentence: string, signals: readonly string[]) {
  const normalized = sentence.toLowerCase().replace(/ё/g, "е");
  return signals.some((signal) => normalized.includes(signal));
}

function splitSentences(script: string) {
  return script.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) || [script];
}

function countWords(sentences: readonly string[]) {
  return sentences.reduce((total, sentence) => total + countOmniScriptWords(sentence), 0);
}

function findLastCtaSentence(sentences: readonly string[]) {
  for (let index = sentences.length - 1; index >= 0; index -= 1) {
    if (CTA_PATTERN.test(sentences[index] || "")) return index;
  }
  return -1;
}

function trimFinalSentence(script: string, maxWords: number) {
  const words = script.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return script;
  return `${words.slice(0, maxWords).join(" ").replace(/[,:;]+$/u, "")}.`;
}
