export type ReferencePresentationMechanic = "comment_review" | "standard";

const COMMENT_REVIEW_PATTERNS = [
  /(?:почитаем|читаю|разбер[её]м)(?:\s+\S+){0,5}\s+(?:ветк|комментар|отзыв)/iu,
  /(?:вот|а\s+вот|дальше)\s+(?:человек|девушка|парень|автор)\s+(?:пишет|написал|написала)/iu,
  /(?:комментарии|отзывы)\s+(?:людей|подписчиков|туристов|покупателей)/iu,
  /(?:расскажите|напишите)[\s\S]{0,120}(?:давайте|сейчас)[\s\S]{0,80}(?:почитаем|разберем|разберём)/iu,
];

export function detectReferencePresentationMechanic(transcript: string): ReferencePresentationMechanic {
  const value = transcript.replace(/\s+/gu, " ").trim();
  return COMMENT_REVIEW_PATTERNS.some((pattern) => pattern.test(value)) ? "comment_review" : "standard";
}

export function renderReferencePresentationContract(transcript: string) {
  if (detectReferencePresentationMechanic(transcript) !== "comment_review") return "";
  return [
    "ОБЯЗАТЕЛЬНЫЙ ФОРМАТ REFERENCE: обзор комментариев или отзывов.",
    "Сохрани механику, а не только тему: ведущий задаёт вопрос, затем последовательно читает минимум два конкретных комментария или отзыва и коротко реагирует на каждый.",
    "Комментарии являются содержательной частью ролика. Не превращай формат в обычный монолог, общую историю или рекламный список.",
    "Используй только конкретику, подтверждённую транскрипцией reference. Не выдавай придуманные отзывы о нашем продукте за реальные.",
    "Продукт вводится только после обзора как личный практический вывод ведущего: не всё в поездке можно контролировать, но подтверждённую продуктом задачу можно подготовить заранее.",
    "CTA продолжает этот вывод одной мягкой фразой и не становится отдельным рекламным блоком.",
    "Для режиссуры: при чтении каждого отзыва в кадре должна появляться отдельная запланированная карточка комментария с тем же коротким текстом. Это часть формата, а не субтитры и не интерфейс соцсети.",
  ].join("\n");
}

export function assertReferencePresentationPreserved(referenceTranscript: string, generatedScript: string) {
  if (detectReferencePresentationMechanic(referenceTranscript) !== "comment_review") return;
  const normalized = generatedScript.toLocaleLowerCase("ru-RU");
  const readingSignals = normalized.match(/(?:пишет|написал[аи]?|комментари|отзыв|вот\s+что|дальше\s+пишут|а\s+здесь)/giu) || [];
  if (readingSignals.length < 2) {
    throw new Error("Сценарий отклонен: reference построен как обзор комментариев. Сохрани вопрос ведущего, минимум два конкретных отзыва из reference и короткую реакцию на каждый до интеграции продукта.");
  }
}

export function hasPlannedCommentCard(value: string) {
  return /(?:карточк[аи]\s+(?:комментар|отзыв)|comment\s*card|review\s*card|вылетает\s+(?:комментар|отзыв))/iu.test(value);
}
