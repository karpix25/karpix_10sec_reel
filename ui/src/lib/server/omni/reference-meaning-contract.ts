const MAX_ANCHORS = 6;
const MAX_ANCHOR_CHARS = 220;

const SEMANTIC_SENTENCE_SIGNALS = [
  "почему",
  "как работает",
  "работает",
  "механизм",
  "оказалось",
  "исслед",
  "доказ",
  "сигнал",
  "клетк",
  "пептид",
  "аминокис",
  "то есть",
  "значит",
  "вывод",
  "но",
  "однако",
  "вопрос",
  "возраж",
];

const CRITICAL_MEANING_SIGNALS = [
  "аминокис",
  "глицин",
  "пролин",
  "гидроксипролин",
  "пептид",
  "фибробласт",
  "гиалурон",
  "синтез",
  "клетк",
  "сигнал",
  "строительн",
  "исслед",
  "доказ",
  "механизм",
  "распад",
  "усваива",
  "биодоступ",
  "активиру",
  "стимулиру",
];

const GENERATED_MECHANISM_PATTERN =
  /(?<=^|[^a-zA-Zа-яА-ЯёЁ0-9])(как|почему|механизм|за счет|работает|сигнал|клетк|пептид|аминокис|исслед|доказ|синтез|активиру|стимулиру|потому что|то есть)(?=$|[^a-zA-Zа-яА-ЯёЁ0-9])/iu;

const LIST_MARKER_PATTERN = /(?:\b(?:во-первых|во-вторых|во-третьих|во-четвертых|во-четвёртых|во-пятых)\b|\b(?:перв(?:ый|ая|ое)|втор(?:ой|ая|ое)|трет(?:ий|ья|ье)|четверт(?:ый|ая|ое)|четвёрт(?:ый|ая|ое)|пят(?:ый|ая|ое)|шест(?:ой|ая|ое))\b|(?:^|\s)\d+[.)])/iu;
const LIST_CONTEXT_PATTERN = /\b(?:совет|совета|советов|шаг|шага|шагов|ошибк|причин|способ|способа|правил|признак|мест|пункт|вариант|секрет|факт)\w*/iu;
const MAX_LIST_ITEMS = 6;

export type ReferenceMeaningContract = {
  anchors: string[];
  criticalSignals: string[];
  listItems: string[];
  requiresListPreservation: boolean;
  requiresMechanism: boolean;
};

export type ReferenceMeaningCoverage = {
  passed: boolean;
  requiresMechanism: boolean;
  coveredSignals: string[];
  missingSignals: string[];
  coverageScore: number;
};

export function buildReferenceMeaningGuidance(referenceScript: string) {
  const contract = buildReferenceMeaningContract(referenceScript);
  const lines = [
    "Смысл reference обязателен: сохрани главный тезис, вопрос или возражение, механизм, доказательство или пример и вывод.",
    "Перепиши под наш продукт и наш бренд, но не превращай в общую рекламу и не выбрасывай объяснение, на котором держался оригинал.",
  ];
  if (contract.anchors.length) {
    lines.push(`Смысловые опоры reference: ${contract.anchors.join(" / ")}`);
  }
  if (contract.criticalSignals.length) {
    lines.push(`Механизм и доказательные сигналы, которые нельзя потерять по смыслу: ${contract.criticalSignals.join(", ")}.`);
  }
  if (contract.requiresListPreservation) {
    lines.push(`В reference есть список из ${contract.listItems.length} обязательных пунктов. Сохрани каждый пункт по смыслу, даже если рекламная вставка и CTA занимают место.`);
    lines.push(`Обязательные пункты reference: ${contract.listItems.join(" / ")}`);
  }
  return lines.join("\n");
}

export function buildReferenceMeaningRepairGuidance(referenceScript: string) {
  const contract = buildReferenceMeaningContract(referenceScript);
  return [
    "КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: предыдущий сценарий потерял причинно следственную логику reference.",
    "Верни механизм или доказательство естественной фразой внутри сценария, а не списком терминов и не общей рекламой.",
    contract.anchors.length
      ? `Опоры исходной мысли: ${contract.anchors.join(" / ")}.`
      : "Сохрани главный тезис, объяснение и вывод original reference.",
    contract.criticalSignals.length
      ? `Обязательные смысловые маркеры: ${contract.criticalSignals.join(", ")}.`
      : "Сохрани конкретный механизм или доказательство original reference.",
    contract.requiresListPreservation
      ? `Обязательные пункты списка reference: ${contract.listItems.join(" / ")}. Не заменяй их продуктом или CTA.`
      : "Если reference содержит список, сохрани его обещанное количество и каждый пункт по смыслу.",
    "Это требование сохраняется даже при исправлении длины, CTA, хука или грамматики. Не добавляй новый CTA и не выдумывай новых обещаний.",
  ].join(" ");
}

export function buildReferenceMeaningContract(referenceScript: string): ReferenceMeaningContract {
  const normalized = normalizeText(referenceScript);
  const criticalSignals = CRITICAL_MEANING_SIGNALS.filter((signal) => normalized.includes(signal));
  const sentences = getSentences(referenceScript);
  const listItems = extractListItems(sentences);
  const anchors = sentences
    .map((sentence, index) => ({
      sentence: trimAnchor(sentence),
      score: scoreSentence(sentence, index),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ANCHORS)
    .map((item) => item.sentence);
  return {
    anchors,
    criticalSignals,
    listItems,
    requiresListPreservation: listItems.length >= 2,
    requiresMechanism: criticalSignals.length >= 2 || anchors.some((anchor) => /механизм|почему|как работает|исслед|доказ/iu.test(anchor)),
  };
}

export function validateReferenceMeaningCoverage(input: {
  referenceScript?: string | null;
  generatedScript: string;
}): ReferenceMeaningCoverage {
  const contract = buildReferenceMeaningContract(input.referenceScript || "");
  const normalizedGenerated = normalizeText(input.generatedScript);
  const coveredSignals = contract.criticalSignals.filter((signal) => normalizedGenerated.includes(signal));
  const missingSignals = contract.criticalSignals.filter((signal) => !normalizedGenerated.includes(signal));
  const requiredSignalCount = contract.criticalSignals.length >= 3 ? 2 : contract.criticalSignals.length;
  const hasEnoughCriticalSignals = coveredSignals.length >= requiredSignalCount;
  const hasGeneratedMechanism = GENERATED_MECHANISM_PATTERN.test(normalizedGenerated);
  const passed = !contract.requiresMechanism || hasEnoughCriticalSignals || (hasGeneratedMechanism && coveredSignals.length > 0);

  return {
    passed,
    requiresMechanism: contract.requiresMechanism,
    coveredSignals,
    missingSignals,
    coverageScore: contract.criticalSignals.length
      ? Math.round((coveredSignals.length / contract.criticalSignals.length) * 100)
      : 100,
  };
}

function extractListItems(sentences: readonly string[]) {
  return sentences
    .filter((sentence) => {
      if (!LIST_MARKER_PATTERN.test(sentence)) return false;
      return /\bво-(?:первых|вторых|третьих|четвертых|четвёртых|пятых)\b|(?:^|\s)\d+[.)]/iu.test(sentence)
        || LIST_CONTEXT_PATTERN.test(sentence);
    })
    .map((sentence) => trimAnchor(sentence))
    .filter((sentence, index, items) => items.indexOf(sentence) === index)
    .slice(0, MAX_LIST_ITEMS);
}

function getSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function scoreSentence(sentence: string, index: number) {
  const normalized = normalizeText(sentence);
  const signalScore = SEMANTIC_SENTENCE_SIGNALS.reduce(
    (score, signal) => score + (normalized.includes(signal) ? 2 : 0),
    0
  );
  const lengthScore = normalized.length > 60 ? 1 : 0;
  const openingScore = index < 2 ? 1 : 0;
  return signalScore + lengthScore + openingScore;
}

function trimAnchor(value: string) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > MAX_ANCHOR_CHARS ? `${clean.slice(0, MAX_ANCHOR_CHARS - 3).trim()}...` : clean;
}

function normalizeText(text: string) {
  return text.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}
