export type ScriptAdaptationMode =
  | "preserve_reference"
  | "adjacent_bridge"
  | "format_transfer";

export type ScriptAdaptationPlan = {
  version: "script-adaptation-v1";
  mode: ScriptAdaptationMode;
  reason: string;
  preserve: string[];
  replace: string[];
  productBridge: string;
  confidence?: number;
};

export function normalizeScriptAdaptationPlan(value: unknown): ScriptAdaptationPlan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const mode = candidate.mode;
  if (mode !== "preserve_reference" && mode !== "adjacent_bridge" && mode !== "format_transfer") return null;
  const reason = readText(candidate.reason);
  const productBridge = readText(candidate.product_bridge ?? candidate.productBridge);
  if (!reason || !productBridge) return null;
  const preserve = readTextArray(candidate.preserve);
  const replace = readTextArray(candidate.replace);
  if (!preserve.length || !replace.length) return null;
  const confidence = Number(candidate.confidence);
  return {
    version: "script-adaptation-v1",
    mode,
    reason,
    preserve,
    replace,
    productBridge,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : undefined,
  };
}

export function renderScriptAdaptationContract(plan: ScriptAdaptationPlan): string {
  const modeLabel = {
    preserve_reference: "СОХРАНЕНИЕ СМЫСЛА",
    adjacent_bridge: "СОСЕДНИЙ НАТИВНЫЙ МОСТ",
    format_transfer: "ПЕРЕНОС ФОРМАТА",
  }[plan.mode];
  return [
    `РЕЖИМ АДАПТАЦИИ: ${modeLabel}.`,
    `Почему выбран этот режим: ${plan.reason}`,
    `Сохрани: ${plan.preserve.join(", ")}.`,
    `Замени или не переноси: ${plan.replace.join(", ")}.`,
    `Связь продукта: ${plan.productBridge}`,
    plan.mode === "format_transfer"
      ? "Не пытайся отвечать на исходный предметный вопрос и не вставляй исходный механизм рядом с продуктом. Построй новый логичный сюжет под продукт, сохранив механику и подачу reference."
      : "Не превращай продукт в отдельный рекламный блок: причинный переход должен следовать из текущей мысли.",
  ].join("\n");
}

export function renderScriptAdaptationRepairContract(plan: ScriptAdaptationPlan): string {
  return plan.mode === "format_transfer"
    ? "Исправление: сохрани форму и механику reference, но полностью убери конфликтующий исходный тезис. Сделай продуктовую проблему и пользу карты центральной мыслью сценария."
    : `Исправление: ${plan.productBridge} Сохрани обязательные смысловые опоры режима «${plan.mode}».`;
}

export function renderScriptAdaptationReviewContract(plan: ScriptAdaptationPlan): string {
  if (plan.mode === "format_transfer") {
    return [
      "Для referenceMeaningPreserved в режиме «перенос формата» не требуй сохранения исходного предметного тезиса.",
      "Проверь вместо этого: сохранены ли форма хука, личная подача, темп, структура и тип финального вывода, а новый тезис продукта раскрыт последовательно.",
    ].join(" ");
  }
  if (plan.mode === "adjacent_bridge") {
    return "В режиме «соседний нативный мост» исходный полезный тезис должен остаться, а продукт может решать соседнюю потребность только через явный причинный переход.";
  }
  return "В режиме «сохранение смысла» проверь исходный тезис, механизм, доказательство или пример и финальный вывод по обычному контракту reference.";
}

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readTextArray(value: unknown) {
  return Array.isArray(value) ? value.map(readText).filter(Boolean) : [];
}
