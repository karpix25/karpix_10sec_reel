import type { ReferenceFormatMode } from "./omni-reference-format-mode";
import type { ReferenceSceneMode } from "./omni-reference-scene-mode";

export type SemanticStoryboardMemoryScope = {
  projectId: number;
  productId: number;
  referenceFormatMode: ReferenceFormatMode;
  referenceSceneMode: ReferenceSceneMode;
};

export type SemanticStoryboardMemoryRule = {
  issueCode: string;
  positiveInstruction: string;
  occurrenceCount: number;
};

export type SemanticStoryboardMemoryIssue = {
  code: string;
};

const MAX_INSTRUCTION_LENGTH = 320;
const HARD_QA_MEMORY_CODES = /^(?:featured_identity_mismatch|identity_mismatch|wrong_(?:featured_)?(?:person|avatar)|product_(?:form|packaging)_mismatch|product_missing|foreign_product|gross_visual_corruption)$/iu;
const POSITIVE_INSTRUCTIONS: Record<string, string> = {
  featured_identity_mismatch: "Любой главный или акцентный человек должен использовать сохранённый аватар.",
  product_form_mismatch: "Показывай продукт только в утверждённой физической или цифровой форме из product contract.",
  product_missing: "Покажи клиентский продукт в запланированной рекламной вставке.",
  product_packaging_mismatch: "Сохраняй утвержденные форму, упаковку и маркировку продукта из product contract.",
  foreign_product: "Не заменяй клиентский продукт чужим рекламируемым товаром или брендом.",
  gross_visual_corruption: "Не допускай явно сломанных лиц, конечностей, смартфонов и физически невозможной геометрии.",
};

export function buildPositiveSemanticMemoryInstruction(
  issue: SemanticStoryboardMemoryIssue,
  fallback?: string,
) {
  const instruction = POSITIVE_INSTRUCTIONS[issue.code] || fallback?.trim() ||
    `Проверяй смысловую раскадровку по текущим reference и product contract для issue ${issue.code}.`;
  return instruction.slice(0, MAX_INSTRUCTION_LENGTH);
}

export function renderSemanticStoryboardMemoryRules(
  rules: readonly SemanticStoryboardMemoryRule[] | undefined,
) {
  const hardRules = rules?.filter((rule) => HARD_QA_MEMORY_CODES.test(rule.issueCode)) || [];
  if (!hardRules.length) return "";
  return [
    "Scoped learned memory, only as additional positive guardrails:",
    ...hardRules.map((rule) => `- ${rule.positiveInstruction}`),
    "Current director analysis and product contract override these learned guardrails.",
  ].join("\n");
}
