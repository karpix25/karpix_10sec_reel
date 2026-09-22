import type { OpenRouterUsageRecord } from "@/lib/omni/openrouter-cost";

export const UNIFIED_PLAN_REPAIR_ATTEMPTS = 2;

export type UnifiedRepairContext = {
  attempt: number;
  previousResponse: string;
  validationError: string;
  openRouterUsage: OpenRouterUsageRecord[];
  sourceObservation: Record<string, unknown>;
};

export function canRepairUnifiedPlan(repair?: UnifiedRepairContext) {
  return (repair?.attempt || 1) <= UNIFIED_PLAN_REPAIR_ATTEMPTS;
}

export function nextUnifiedRepair(input: {
  repair?: UnifiedRepairContext;
  previousResponse: string;
  validationError: string;
  openRouterUsage: OpenRouterUsageRecord[];
  sourceObservation: Record<string, unknown>;
}): UnifiedRepairContext {
  return {
    attempt: (input.repair?.attempt || 1) + 1,
    previousResponse: input.previousResponse,
    validationError: input.validationError,
    openRouterUsage: input.openRouterUsage,
    sourceObservation: input.sourceObservation,
  };
}

export function buildUnifiedPlanRepairPrompt(
  previousResponse: string,
  validationError: string,
  sourceObservation: Record<string, unknown>,
) {
  return [
    "Исправь готовый JSON-план ролика по точному отчёту валидатора.",
    "Это repair-проход: не анализируй референс заново и не создавай новую концепцию.",
    "Сохрани reference_analysis, spoken_transcript, director_brief, тему, обещание хука, формат подачи, визуальный стиль и нативную роль продукта.",
    "Не меняй reference_analysis, spoken_transcript и фактические поля director_brief: это зафиксированный анализ source video.",
    "Полностью пересобери согласованный блок title, hook_options, selected_hook, total_voiceover, segments, storyboard_frames, product_beat, adaptation_trace и self_check. Не латай старую битовку после изменения сценария.",
    "Верни полный корневой JSON со всеми исходными разделами.",
    "Верни компактный JSON без форматирования и повторов. Служебные описания сокращай до одной конкретной фразы, чтобы ответ поместился в лимит.",
    "Каждый двухсекундный storyboard frame должен содержать три или четыре финальных русских слова.",
    "voiceover сегмента должен дословно совпадать с объединением spoken_words его кадров в исходном порядке.",
    "total_voiceover должен дословно совпадать с объединением voiceover всех сегментов.",
    "Если речи слишком много, сократи формулировки без потери темы, фактов, логики, названия продукта и CTA. CTA не удаляй, сделай его мягким и органичным.",
    "Сохрани ровно один непрерывный интервал product_beat. Не добавляй новый показ продукта.",
    "Пересчитай слова перед ответом. self_check=true допустим только для реально выполненных условий.",
    "",
    "НЕИЗМЕНЯЕМЫЙ SOURCE OBSERVATION:",
    JSON.stringify(sourceObservation),
    "",
    "ОШИБКИ ВАЛИДАТОРА:",
    validationError,
    "",
    "ИСХОДНЫЙ JSON:",
    previousResponse,
  ].join("\n");
}
