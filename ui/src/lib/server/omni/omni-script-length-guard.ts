import { countOmniScriptWords } from "./omni-duration-planner";

const CTA_PATTERN = /артикул|описани|коммент|кодово.*слов|ссылк|профил/iu;

export function compactOmniScriptToWordBudget(script: string, maxWords: number) {
  if (countOmniScriptWords(script) <= maxWords) return script;

  const sentences = splitSentences(script);
  while (countWords(sentences) > maxWords) {
    const overflow = countWords(sentences) - maxWords;
    const ctaIndex = findLastCtaSentence(sentences);
    const removable = sentences
      .map((sentence, index) => ({ sentence, index, words: countOmniScriptWords(sentence) }))
      .filter(({ index }) => index !== 0 && index !== ctaIndex);
    const candidate = removable
      .filter(({ words }) => words >= overflow)
      .sort((left, right) => left.words - right.words)[0] || removable.sort((left, right) => right.index - left.index)[0];
    if (!candidate) break;
    sentences.splice(candidate.index, 1);
  }

  const compacted = sentences.join(" ").replace(/\s+/g, " ").trim();
  return trimFinalSentence(compacted, maxWords);
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
