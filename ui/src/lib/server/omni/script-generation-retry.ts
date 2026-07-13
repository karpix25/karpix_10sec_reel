export const MAX_SCRIPT_GENERATION_ATTEMPTS = 3;

const RETRYABLE_MODEL_ERROR_FRAGMENTS = [
  "Сценарий отклонен:",
  "No JSON object found in script model output",
  "Failed to parse script JSON",
  "Script model returned empty script",
  "Omni script contains a long dash or emoji",
];

export function isRetryableScriptGenerationError(error: unknown) {
  const message = getErrorMessage(error);
  return RETRYABLE_MODEL_ERROR_FRAGMENTS.some((fragment) => message.includes(fragment));
}

export function buildScriptRetryFeedback(error: unknown) {
  const message = getErrorMessage(error);

  if (message.includes("emoji") || message.includes("длинное тире") || message.includes("long dash")) {
    return [
      "Предыдущий ответ отклонен: в нем был emoji или длинный знак тире.",
      "Верни новый JSON с тем же смыслом, но без emoji и без символов: —, –, ‒, ―, −.",
      "Если нужен разделитель, используй запятую, точку или обычный дефис -.",
    ].join(" ");
  }

  if (message.includes("JSON")) {
    return [
      "Предыдущий ответ отклонен: JSON был сломан или окружен лишним текстом.",
      "Верни только один валидный JSON-объект без markdown, комментариев и пояснений.",
    ].join(" ");
  }

  return [
    `Предыдущий ответ отклонен: ${message.slice(0, 220)}.`,
    "Перепиши сценарий заново и строго соблюдай все правила формата.",
  ].join(" ");
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
