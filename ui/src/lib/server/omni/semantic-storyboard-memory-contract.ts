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
const POSITIVE_INSTRUCTIONS: Record<string, string> = {
  environment_mismatch: "Используй локации и окружение, подтвержденные текущим анализом reference.",
  final_answer_missing: "Заверши финальный сегмент визуальным ответом на главный тезис до CTA.",
  frame_action_mismatch: "Связывай действие каждого кадра с текущей репликой и action beats reference.",
  product_packaging_mismatch: "Сохраняй утвержденные форму, упаковку и маркировку продукта из product contract.",
  product_placement_mismatch: "Показывай согласованный продукт, когда текущая реплика требует его присутствия.",
  reference_format_mismatch: "Сохраняй выбранный reference format и его observed delivery/layout mechanics.",
  wardrobe_mismatch: "Сохраняй утвержденные одежду, цвет и фасон reference в рамках текущего формата.",
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
  if (!rules?.length) return "";
  return [
    "Scoped learned memory, only as additional positive guardrails:",
    ...rules.map((rule) => `- ${rule.positiveInstruction}`),
    "Current director analysis and product contract override these learned guardrails.",
  ].join("\n");
}
