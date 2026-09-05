import type { ScriptSemanticDefect, ScriptSemanticReview } from "./llm-prompt-chain-types";
import { spellPromptChainNumbersInText } from "./llm-prompt-chain-number-words";

type ReviewContext = { script: string; referenceScript: string; productName: string; productDescription?: string | null; productReferenceNotes?: string | null };

const CODES = new Set<ScriptSemanticDefect["code"]>([
  "missing_product", "missing_product_value", "missing_answer", "missing_list_item", "unsupported_product_claim",
]);

/** Evidence is checked against the actual inputs, never against another model explanation. */
export function normalizeGroundedSemanticReview(raw: unknown, input: ReviewContext): ScriptSemanticReview {
  const record = object(raw);
  const evidence = object(record?.evidence);
  if (!record || !evidence || !Array.isArray(record.defects) || !Array.isArray(record.warnings)) {
    throw new Error("Смысловая проверка вернула некорректный отчёт: нужны evidence, defects и warnings.");
  }
  for (const key of ["product", "value", "answer", "referenceAnswer", "expectedAnswer", "transition"]) {
    if (typeof evidence[key] !== "string") throw new Error(`Смысловая проверка не заполнила evidence.${key}.`);
  }
  if (evidence.answerKind !== "named_fact" && evidence.answerKind !== "explanation") {
    throw new Error("Смысловая проверка не указала тип исходного ответа.");
  }
  const warnings = record.warnings.filter((value): value is string => typeof value === "string");
  const quote = (key: string) => text(evidence[key]);
  const verified = (key: string) => containsQuote(input.script, quote(key)) ? quote(key) : "";
  const defects: ScriptSemanticDefect[] = [];
  const add = (code: ScriptSemanticDefect["code"], message: string, referenceQuote = "", scriptQuote = "", expectedText = "") => {
    defects.push({ code, message, referenceQuote, scriptQuote, expectedText });
  };
  const productNamed = hasSpokenProductName(input.script, input.productName);
  if (!productNamed) add("missing_product", `Не назван продукт «${input.productName}».`, "", "", input.productName);
  const productValue = verified("value");
  // Missing positive evidence is not proof that useful speech is absent.
  if (!productValue && record.defects.some((item) => object(item)?.code === "missing_product_value")) {
    const productSentence = input.script.split(/(?<=[.!?])\s+/u).find((sentence) => hasSpokenProductName(sentence, input.productName)) || "";
    add("missing_product_value", "В сценарии не объяснена конкретная польза продукта.", "", productSentence);
  }

  const expectedAnswer = quote("expectedAnswer");
  const referenceAnswer = containsQuote(input.referenceScript, quote("referenceAnswer")) ? quote("referenceAnswer") : expectedAnswer;
  const answer = verified("answer");
  const anchors = expectedAnswer.split(/,\s+|;\s*/u).filter(Boolean);
  const groundedAnswer = anchors.length > 0 && anchors.every((anchor) => containsQuote(input.referenceScript, anchor));
  const answerPresent = groundedAnswer && anchors.every((anchor) => containsNamedFact(input.script, anchor)) ||
    (evidence.answerKind === "explanation" && Boolean(answer));
  if (!answerPresent && groundedAnswer) {
    add("missing_answer", "В сценарии потерян ответ из оригинала.", referenceAnswer, "", expectedAnswer);
  }
  if (!groundedAnswer) warnings.push("Проверяющий неточно процитировал исходный ответ; это не доказательство дефекта сценария.");

  for (const value of record.defects) {
    const item = object(value);
    const code = text(item?.code) as ScriptSemanticDefect["code"];
    const message = text(item?.message);
    if (!CODES.has(code)) {
      if (message) warnings.push(message);
      continue;
    }
    // These checks have already been reconciled with exact evidence above.
    if (code === "missing_product" || code === "missing_product_value") continue;
    const referenceQuote = text(item?.referenceQuote);
    const scriptQuote = text(item?.scriptQuote);
    const expectedText = text(item?.expectedText);
    if (code === "missing_answer" || code === "missing_list_item") {
      if (code === "missing_answer" && (answerPresent || defects.some((defect) => defect.code === "missing_answer"))) continue;
      if (!containsQuote(input.referenceScript, referenceQuote) || !containsQuote(referenceQuote, expectedText)) {
        throw new Error("Проверка списка не подтвердила пропущенный пункт цитатой из оригинала.");
      }
      if (containsNamedFact(input.script, expectedText) || containsQuote(input.script, scriptQuote)) {
        warnings.push(`Противоречивое замечание о пропущенном пункте: ${message}`);
        continue;
      }
    } else {
      if (!containsQuote(input.script, scriptQuote) || !containsQuote(scriptQuote, expectedText)) {
        throw new Error("Проверка свойств продукта не привела точную цитату и конкретное спорное свойство.");
      }
      const facts = [input.productDescription, input.productReferenceNotes].filter(Boolean).join(" ");
      const supported = facts.split(/(?<=[.!?])\s+/u).some((sentence) => containsQuote(sentence, expectedText) &&
        !/(?<!\p{L})(?:не|нет|нельзя|невозможно|отсутствует|запрещено)(?!\p{L})/iu.test(sentence));
      if (supported) {
        warnings.push(`Свойство уже подтверждено данными продукта: ${expectedText}`);
        continue;
      }
      if (/не\s+связан|нет\s+связи|неестествен|искусствен|можно\s+удалить|переход|не\s+является\s+продолжением/iu.test(message)) {
        warnings.push(message);
        continue;
      }
    }
    if (!message) throw new Error("Смысловая проверка не объяснила конкретный дефект.");
    add(code, message, referenceQuote, scriptQuote, expectedText);
  }

  return {
    version: "script-semantic-review-v2", passed: defects.length === 0,
    productNamed, productValueStated: !defects.some((d) => d.code === "missing_product_value"), hookAnswered: !defects.some((d) => d.code === "missing_answer"),
    finalAnswerPresent: !defects.some((d) => d.code === "missing_answer"), productNaturallyIntegrated: !defects.some((d) => d.code === "unsupported_product_claim"),
    referenceMeaningPreserved: !defects.some((d) => d.code === "missing_answer" || d.code === "missing_list_item"),
    evidence: { product: verified("product"), value: productValue, answer: answer || (answerPresent ? expectedAnswer : ""), transition: verified("transition") },
    defects, warnings,
    issues: defects.map(renderSemanticDefectIssue),
    // Never feed free-form model advice (including invented benefits) to the repair writer.
    repairInstructions: defects.map(renderSemanticDefectRepair),
  };
}

function renderSemanticDefectIssue(defect: ScriptSemanticDefect): string {
  switch (defect.code) {
    case "missing_product": return `Не назван продукт «${defect.expectedText}».`;
    case "missing_product_value": return "Не объяснена конкретная польза продукта.";
    case "missing_answer": return `Потерян ответ из оригинала: «${defect.expectedText}».`;
    case "missing_list_item": return `Пропущен пункт обещанного списка: «${defect.expectedText}».`;
    case "unsupported_product_claim": return `Неподтверждённое свойство продукта: «${defect.expectedText}».`;
  }
}

export function renderSemanticDefectRepair(defect: ScriptSemanticDefect): string {
  switch (defect.code) {
    case "missing_product": return `Произнеси название продукта «${defect.expectedText}».`;
    case "missing_product_value": return `В предложении «${defect.scriptQuote}» прямо назови действие, которое позволяет выполнить продукт, только из описания и заметок. Сохрани остальные факты предложения. Не возвращай эту продуктовую фразу без изменений.`;
    case "missing_answer": return `Верни ответ из оригинала: «${defect.referenceQuote}». Не заменяй его рекламой.`;
    case "missing_list_item": return `Восстанови пропущенный пункт обещанного списка: «${defect.referenceQuote}».`;
    case "unsupported_product_claim": return `Удали или исправь неподтверждённое свойство «${defect.expectedText}» в утверждении «${defect.scriptQuote}», используя только описание и заметки продукта.`;
  }
}

export function containsQuote(source: string, quote: string): boolean {
  const normalized = normalize(quote);
  return normalized.length > 0 && (` ${normalize(source)} `).includes(` ${normalized} `);
}

export function hasSpokenProductName(script: string, productName: string): boolean {
  return containsNamedFact(script, productName);
}

function containsNamedFact(script: string, fact: string): boolean {
  if (containsQuote(script, fact)) return true;
  const expected = normalize(fact).split(" ").filter(Boolean);
  const words = normalize(script).split(" ");
  // ponytail: conservative Russian ending tolerance; no fuzzy brand aliases or one-keyword matches.
  return expected.length > 0 && words.some((_, start) => expected.every((word, index) => {
    const candidate = words[start + index] || "";
    const stem = (value: string) => /^[а-я]+$/u.test(value)
      ? value.replace(/(?:ая|ую|ой|ые|ых|ами|ями|а|я|у|ю|ы|и|е|ом)$/u, "") : value;
    return candidate === word || (word.length >= 5 && candidate.length >= 5 && stem(word).length >= 4 && stem(candidate) === stem(word));
  }));
}

function normalize(value: string) {
  return spellPromptChainNumbersInText(value).toLocaleLowerCase("ru-RU").replace(/ё/gu, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
