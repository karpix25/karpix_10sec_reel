import { buildReferenceMeaningContract, type ReferenceMeaningContract } from "./reference-meaning-contract";
import type { ScriptAdaptationPlan } from "./script-adaptation-contract";

export const WRITER_OWNED_ADAPTATION_PLAN: ScriptAdaptationPlan = {
  version: "script-adaptation-v1",
  mode: "writer_owned",
  reason: "Сценарист переписывает оригинал, сохраняя его историю и добавляя наш продукт.",
  preserve: ["тему, силу хука, полезную логику и естественную подачу reference"],
  replace: ["чужой продукт, рекламу и CTA"],
  productBridge: "Найти честную причинную связь между текущей мыслью и подтвержденной пользой продукта.",
  confidence: 1,
};

export const SCRIPT_CONTENT_CONTRACT_VERSION = "script-content-v1" as const;

export type ScriptSourceMeaning = {
  hook: string;
  mainQuestion: string;
  answerOrMechanism: string;
  requiredPoints: string[];
  proofExamples: string[];
  conclusion: string;
};

export type ScriptContentContract = {
  version: typeof SCRIPT_CONTENT_CONTRACT_VERSION;
  sourceMeaning: ScriptSourceMeaning;
  adaptation: ScriptAdaptationPlan;
};

export function buildWriterOwnedScriptContentContract(referenceScript: string): ScriptContentContract {
  return {
    version: SCRIPT_CONTENT_CONTRACT_VERSION,
    sourceMeaning: sourceMeaningFromHeuristics(referenceScript, buildReferenceMeaningContract(referenceScript)),
    adaptation: WRITER_OWNED_ADAPTATION_PLAN,
  };
}

function sourceMeaningFromHeuristics(
  referenceScript: string,
  meaning: ReferenceMeaningContract,
): ScriptSourceMeaning {
  const sentences = getSentences(referenceScript);
  const hook = sentences[0] || meaning.anchors[0] || "Хук reference";
  const question = sentences.find((sentence) => /[?]|\b(?:почему|как|можно ли|что делать)\b/iu.test(sentence));
  const conclusion = sentences[sentences.length - 1] || hook;
  return {
    hook,
    mainQuestion: question || meaning.anchors[0] || hook,
    answerOrMechanism: meaning.criticalSignals.length
      ? `Сохрани объяснение через: ${meaning.criticalSignals.join(", ")}`
      : meaning.anchors[1] || meaning.anchors[0] || hook,
    requiredPoints: meaning.listItems,
    proofExamples: meaning.anchors.slice(0, 2),
    conclusion,
  };
}

function getSentences(text: string) {
  return text.split(/(?<=[.!?])\s+/u).map((sentence) => sentence.trim()).filter(Boolean);
}
