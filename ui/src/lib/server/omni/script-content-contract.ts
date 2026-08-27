import {
  buildReferenceMeaningContract,
  type ReferenceMeaningContract,
} from "./reference-meaning-contract";
import {
  normalizeScriptAdaptationPlan,
  renderScriptAdaptationContract,
  type ScriptAdaptationPlan,
} from "./script-adaptation-contract";

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

export class IncompatibleReferenceError extends Error {
  constructor(readonly contract: ScriptContentContract) {
    super(`Reference нельзя честно адаптировать под продукт: ${contract.adaptation.reason}`);
    this.name = "IncompatibleReferenceError";
  }
}

export function normalizeScriptContentContract(value: unknown): ScriptContentContract | null {
  if (!isRecord(value)) return null;
  const sourceMeaning = normalizeSourceMeaning(value.source_meaning ?? value.sourceMeaning);
  const adaptation = normalizeScriptAdaptationPlan(value.adaptation ?? value.adaptation_plan);
  if (!sourceMeaning || !adaptation) return null;
  return {
    version: SCRIPT_CONTENT_CONTRACT_VERSION,
    sourceMeaning,
    adaptation,
  };
}

export function buildLegacyScriptContentContract(
  referenceScript: string,
  adaptation: ScriptAdaptationPlan,
): ScriptContentContract {
  const meaning = buildReferenceMeaningContract(referenceScript);
  return {
    version: SCRIPT_CONTENT_CONTRACT_VERSION,
    sourceMeaning: sourceMeaningFromHeuristics(referenceScript, meaning),
    adaptation,
  };
}

export function renderScriptContentContract(contract: ScriptContentContract) {
  const meaning = contract.sourceMeaning;
  return [
    "ЕДИНЫЙ КОНТЕНТНЫЙ КОНТРАК REFERENCE:",
    "Работай строго в границах выбранного режима. Отдельным контрактом адаптации определены смысловые опоры, замены и продуктовый мост.",
    `Хук: ${meaning.hook}`,
    `Главный вопрос или конфликт: ${meaning.mainQuestion}`,
    `Ответ или механизм reference: ${meaning.answerOrMechanism}`,
    `Обязательные смысловые пункты: ${renderList(meaning.requiredPoints)}`,
    `Доказательства или примеры: ${renderList(meaning.proofExamples)}`,
    `Финальный вывод reference: ${meaning.conclusion}`,
    renderScriptAdaptationContract(contract.adaptation),
    "Смысловые пункты проверяй по значению, а не по дословному совпадению. Не заменяй обязательный пункт названием продукта, CTA или общей рекламной фразой.",
  ].join("\n");
}

export function renderScriptContentRepairContract(contract: ScriptContentContract) {
  const meaning = contract.sourceMeaning;
  if (contract.adaptation.mode === "incompatible") {
    return `${renderScriptContentContract(contract)}\nПочинка не запускается: верни понятную причину несовместимости без сценария.`;
  }
  return [
    renderScriptContentContract(contract),
    `При починке обязательно верни пропущенные пункты: ${renderList(meaning.requiredPoints)}.`,
    "Если режим adjacent_bridge, сначала восстанови ответ reference, затем сделай продуктовый переход. Если режим format_transfer, не возвращай несовместимый исходный механизм.",
  ].join("\n");
}

export function getScriptContentMeaningSignals(contract: ScriptContentContract) {
  return [
    contract.sourceMeaning.mainQuestion,
    contract.sourceMeaning.answerOrMechanism,
    ...contract.sourceMeaning.requiredPoints,
    ...contract.sourceMeaning.proofExamples,
  ].filter(Boolean);
}

function normalizeSourceMeaning(value: unknown): ScriptSourceMeaning | null {
  if (!isRecord(value)) return null;
  const sourceMeaning = {
    hook: readText(value.hook),
    mainQuestion: readText(value.main_question ?? value.mainQuestion),
    answerOrMechanism: readText(value.answer_or_mechanism ?? value.answerOrMechanism),
    requiredPoints: readTextArray(value.required_points ?? value.requiredPoints),
    proofExamples: readTextArray(value.proof_examples ?? value.proofExamples),
    conclusion: readText(value.conclusion),
  } satisfies ScriptSourceMeaning;
  if (!sourceMeaning.hook || !sourceMeaning.mainQuestion || !sourceMeaning.answerOrMechanism || !sourceMeaning.conclusion) return null;
  return sourceMeaning;
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

function renderList(values: readonly string[]) {
  return values.length ? values.join(" / ") : "не выделены";
}

function readText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function readTextArray(value: unknown) {
  return Array.isArray(value) ? value.map(readText).filter(Boolean) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
