export const MAX_SCRIPT_GENERATION_ATTEMPTS = 5;

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

  const shortMatch = message.match(/слишком короткий[^(]*\((\d+) слов\).*?Нужно (\d+)-(\d+) слов/iu);
  if (shortMatch) {
    const currentWords = Number.parseInt(shortMatch[1] || "0", 10);
    const minWords = Number.parseInt(shortMatch[2] || "0", 10);
    const maxWords = Number.parseInt(shortMatch[3] || "0", 10);
    const targetWords = Math.max(minWords, Math.floor((minWords + maxWords) / 2));
    return [
      `Предыдущий ответ был слишком короткий: ${currentWords} слов.`,
      `Новый сценарий должен быть ${targetWords}-${maxWords} слов, строго внутри диапазона ${minWords}-${maxWords}.`,
      `Перед ответом посчитай слова в beats.voiceover и script. Если меньше ${minWords}, добавь конкретики до ${targetWords}-${maxWords} слов.`,
      "Расширь 2-3 смысловых бита: добавь конкретный бытовой пример, механизм действия продукта и короткий вывод.",
      "Не добавляй второй CTA, emoji, длинное тире или лишние вводные фразы.",
      "Поле script и сумма beats.voiceover должны совпадать и попадать в нужный word count.",
    ].join(" ");
  }

  const longMatch = message.match(/слишком длинн[а-я\s]*\((\d+) слов\).*?Нужно (\d+)-(\d+) слов/iu);
  if (longMatch) {
    const currentWords = Number.parseInt(longMatch[1] || "0", 10);
    const minWords = Number.parseInt(longMatch[2] || "0", 10);
    const maxWords = Number.parseInt(longMatch[3] || "0", 10);
    const targetWords = Math.max(minWords, Math.floor((minWords + maxWords) / 2));
    return [
      `Предыдущий ответ был слишком длинный: ${currentWords} слов.`,
      `Новый сценарий должен быть ${targetWords}-${maxWords} слов, строго внутри диапазона ${minWords}-${maxWords}.`,
      "Сожми формулировки, оставь только хук, 2-3 плотных бита и один CTA.",
      "Поле script и сумма beats.voiceover должны совпадать и попадать в нужный word count.",
    ].join(" ");
  }

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

export function buildScriptGenerationFailure(error: unknown, attempts: number) {
  const message = getErrorMessage(error);
  if (!isRetryableScriptGenerationError(error) || attempts <= 1) {
    return error instanceof Error ? error : new Error(message);
  }

  return new Error(
    `Сценарий не прошел проверку после ${attempts} попыток генерации. Последняя ошибка: ${message}`
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
