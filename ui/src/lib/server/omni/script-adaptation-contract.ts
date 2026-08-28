export type ScriptAdaptationMode =
  | "preserve_reference"
  | "adjacent_bridge"
  | "format_transfer"
  | "writer_owned"
  | "incompatible";

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
  if (
    mode !== "preserve_reference" &&
    mode !== "adjacent_bridge" &&
    mode !== "format_transfer" &&
    mode !== "writer_owned" &&
    mode !== "incompatible"
  ) return null;
  const reason = readText(candidate.reason);
  const productBridge = readText(candidate.product_bridge ?? candidate.productBridge);
  if (!reason || (mode !== "incompatible" && !productBridge)) return null;
  const preserve = readTextArray(candidate.preserve ?? candidate.must_preserve);
  const replace = readTextArray(candidate.replace ?? candidate.may_replace);
  if (mode !== "incompatible" && !preserve.length) return null;
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
    writer_owned: "АДАПТАЦИЯ ВНУТРИ СЦЕНАРИСТА",
    incompatible: "НЕСОВМЕСТИМЫЙ REFERENCE",
  }[plan.mode];
  return [
    `РЕЖИМ АДАПТАЦИИ: ${modeLabel}.`,
    `Почему выбран этот режим (только смысл): ${renderSemanticOnlyText(plan.reason)}`,
    `Смысловые опоры сценария (только voiceover): ${plan.preserve.map(renderSemanticOnlyText).join(", ")}.`,
    `Смысловые замены сценария (только voiceover): ${plan.replace.map(renderSemanticOnlyText).join(", ")}.`,
    `Связь продукта (только смысл): ${renderSemanticOnlyText(plan.productBridge)}`,
    "Этот блок управляет только смыслом voiceover и нарративной адаптацией: темой, хуком, углом, аргументами, примерами, product bridge и тоном подачи. Не используй reason, preserve, replace или productBridge как источник фактов о локации, транспорте, реквизите, камере, крупности, B-roll, роли персонажа, speech_mode, avatar_allowed или одежде.",
    "Все визуальные факты бери только из проверенного SOURCE SHOT TIMELINE и REFERENCE SHOT CONTRACT. Если в тексте упоминаются taxi, Uber, машина или поездка, это само по себе не создает автомобильный кадр.",
    plan.mode === "writer_owned"
      ? "Сценарист сам определяет, что сохранить из темы reference, а что заменить под продукт. Не отбрасывай сценарий заранее из-за несовпадения тем: сначала ищи честную связь или переносимую форму хука."
      : plan.mode === "format_transfer"
      ? "Не пытайся отвечать на исходный предметный вопрос и не вставляй исходный механизм рядом с продуктом. Построй новый логичный сюжет под продукт, сохранив форму хука, темп и подачу reference."
      : plan.mode === "incompatible"
        ? "Этот reference нельзя честно адаптировать под продукт. Не запускай сценарист, reviewer или repair; верни понятную причину отказа."
      : "Не превращай продукт в отдельный рекламный блок: причинный переход должен следовать из текущей мысли.",
  ].join("\n");
}

export function renderScriptAdaptationRepairContract(plan: ScriptAdaptationPlan): string {
  if (plan.mode === "incompatible") {
    return "Починка не запускается: reference нельзя честно адаптировать под продукт. Верни понятную причину отказа без сценария.";
  }
  return plan.mode === "writer_owned"
    ? "Починка только voiceover: заново найди честную связь между смыслом reference и продуктом. Сохрани сильную форму хука, если она применима, либо адаптируй её под реальную потребность продукта. Не выдумывай факты и не вставляй продукт отдельным рекламным блоком."
    : plan.mode === "format_transfer"
    ? "Исправление только voiceover: сохрани форму хука, смысловую логику, темп и подачу reference, но полностью убери конфликтующий исходный тезис. Не переноси визуальные факты reference в этот сценарный контракт. Сделай продуктовую проблему и пользу карты центральной мыслью сценария."
    : `Исправление только voiceover: ${renderSemanticOnlyText(plan.productBridge)} Сохрани обязательные смысловые опоры режима «${plan.mode}». Визуальные факты бери только из проверенного reference timeline.`;
}

export function renderScriptAdaptationReviewContract(plan: ScriptAdaptationPlan): string {
  if (plan.mode === "incompatible") {
    return "Reference несовместим с продуктом: сценарий не должен запускаться на смысловую проверку.";
  }
  if (plan.mode === "writer_owned") {
    return "Сценарист сам выбрал смысловую адаптацию. Проверь, что хук и структура reference сохранены или честно адаптированы, а связь продукта с новой мыслью причинная и подтверждена входными данными. Не требуй заранее выбранного режима."
  }
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

function renderSemanticOnlyText(value: string) {
  const normalized = readText(value).replace(/\s+/gu, " ");
  if (!normalized) return "смысловая опора reference";
  return normalized.replace(
    /\bcar\s+passenger(?:\s+(?:delivery|style|format))?\b/giu,
    "conversational delivery"
  );
}

function readTextArray(value: unknown) {
  if (Array.isArray(value)) return value.map(readText).filter(Boolean);
  const text = readText(value);
  return text ? [text] : [];
}
