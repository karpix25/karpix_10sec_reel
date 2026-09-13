const FACT_WORDS = /бесплат|цена|стоим|рубл|доллар|донг|бат|минут|час|дн(?:я|ей)|километр|метр|отел|гостиниц|резорт|hotel|resort|бунгал|вилл|спа|велосипед|риф|пляж/iu;
const NUMBER_FACT = /(?<!\p{L})(\d{1,3}(?:[ ., ]\d{3})*|\d+)\s*(?:руб(?:ля|лей)?|доллар(?:ов|а)?|донг(?:ов|а)?|бат(?:ов|а)?|минут(?:ы|у)?|час(?:а|ов)?|дн(?:я|ей)|километр(?:а|ов)?|метр(?:а|ов)?|звезд[ы]?)/giu;
const VENUE_NAME = /(?<!\p{L})(?:[Оо]тел[ья]|[Гг]остиниц[а-я]*|[Рр]езорт|[Hh]otel|[Rr]esort|[Кк]афе|[Рр]есторан)\s+(?:под\s+названием\s+)?([A-ZА-ЯЁ][\p{L}\d'’.\-]*(?:\s+[A-ZА-ЯЁ][\p{L}\d'’.\-]*){0,3})/gu;

export type ReferenceFactContract = {
  factSentences: string[];
  namedVenues: string[];
  numericFacts: string[];
};

export function buildReferenceFactContract(referenceScript: string): ReferenceFactContract {
  const sentences = splitSentences(referenceScript);
  const namedVenues = unique([...referenceScript.matchAll(VENUE_NAME)].map((match) => match[1].trim()));
  const numericFacts = unique([...referenceScript.matchAll(NUMBER_FACT)].map((match) => match[0].trim()));
  const factSentences = sentences
    .map((sentence, index) => ({ sentence, index, score: scoreFactSentence(sentence, namedVenues, numericFacts) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, 4)
    .map((item) => item.sentence);
  return { factSentences, namedVenues, numericFacts };
}

export function renderReferenceFactContract(referenceScript: string) {
  const contract = buildReferenceFactContract(referenceScript);
  if (!contract.factSentences.length) {
    return "В reference нет выделенных числовых или именных фактов. Не выдумывай их ради конкретики; собери новую историю из темы и данных продукта.";
  }
  return [
    "ВЫБИРАЕМЫЕ ФАКТЫ REFERENCE:",
    ...contract.factSentences.map((fact) => `• ${fact}`),
    "Это банк деталей, а не список обязательных элементов. Используй ноль, один или несколько фактов только если они помогают новой продуктовой истории. Если деталь не помогает связке, опусти её.",
    "Если включаешь название или число, не искажай его и не превращай в неподтверждённое обещание.",
    contract.namedVenues.length
      ? `Названия объектов, найденные в reference: ${contract.namedVenues.join(", ")}.`
      : "",
    contract.numericFacts.length
      ? `Измеримые факты, доступные для выбора: ${contract.numericFacts.join(", ")}.`
      : "",
  ].filter(Boolean).join("\n");
}

function scoreFactSentence(sentence: string, namedVenues: readonly string[], numericFacts: readonly string[]) {
  return (namedVenues.some((name) => sentence.includes(name)) ? 4 : 0)
    + (numericFacts.some((fact) => sentence.includes(fact)) ? 3 : 0)
    + (FACT_WORDS.test(sentence) ? 1 : 0);
}

function splitSentences(text: string) {
  return text.split(/(?<=[.!?])\s+/u).map((sentence) => sentence.trim()).filter(Boolean);
}

function unique(values: readonly string[]) {
  return [...new Set(values.filter(Boolean))];
}
