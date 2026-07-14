import type { CtaMode } from "@/lib/omni/creative-contract";
import type { OmniLegacyScenario } from "@/lib/omni/types";

export function buildPrompt(input: {
  projectName: string;
  targetAudience: string | null;
  brandVoice: string | null;
  productName: string;
  productDescription: string | null;
  productReferenceNotes: string | null;
  ctaMode: CtaMode;
  ctaValue: string | null;
  sourceScenario: OmniLegacyScenario;
  retryFeedback?: string | null;
}) {
  return `
Создай 1 новый сценарий для Instagram Reels по методологии reels-script-writer.

Правила:
1. Используй исходную транскрибацию референс-видео как паттерн формата: хук, структура удержания, ритм, порядок смысловых битов и подачу.
2. Новый сценарий должен продвигать выбранный продукт.
3. Формат: говорящая голова.
4. Структура: кульминационный хук 0-3 сек, 2-3 плотных бита, один CTA.
5. CTA: ${buildCtaInstruction(input.ctaMode, input.ctaValue)}
6. Не добавляй второй CTA и не меняй выбранное действие. Если для CTA нужны конкретные данные и их нет, не выдумывай их.
7. Не используй дешевый кликбейт: "СТОП", "не листай", "99% людей", "секрет, который скрывают", "досмотри до конца".
8. Не используй ни один длинный знак тире: —, –, ‒, ―, −. Также не используй слова "является", "в современном мире", "стоит отметить", "важно понимать".
9. Не добавляй emoji ни в одно поле JSON.
10. Пиши бытовым русским языком. Одна мысль в одной строке.
11. Целевая длина сценария: 54-84 слова. В каждом 10-секундном куске должно быть примерно 22-27 слов, чтобы не было пауз и пустых действий.

Бренд: ${input.projectName}
Целевая аудитория: ${input.targetAudience || "не указана"}
Tone of voice: ${input.brandVoice || "не указан"}

Продукт: ${input.productName}
Описание продукта: ${input.productDescription || "не указано"}
Заметки по продукту: ${input.productReferenceNotes || "не указаны"}

Оригинальная транскрибация reference-видео:
${input.sourceScenario.script}
${input.retryFeedback ? `\nПовторная попытка:\n${input.retryFeedback}` : ""}

Верни JSON строго такого вида:
{
  "title": "короткий заголовок сценария",
  "hook": "кульминационный хук",
  "script": "полный сценарий одной строкой или многострочным текстом; не массив и не объект",
  "caption": "описание поста в соответствии с выбранным CTA; без выдуманных номеров и ссылок",
  "cta_keyword": "кодовое слово только для CTA через комментарии; иначе пустая строка",
  "lead_magnet": "пустая строка, если отдельного подарка нет"
}
`;
}

function buildCtaInstruction(mode: CtaMode, value: string | null) {
  if (mode === "keyword_in_comments") {
    return `в финале естественно попроси написать кодовое слово «${value}» в комментариях; произнеси его точно`;
  }
  if (mode === "link_in_profile") {
    return `в финале мягко направь к ссылке в профиле${value ? `; назначение ссылки: ${value}` : ""}`;
  }
  if (mode === "no_explicit_cta") return "не добавляй явный призыв; закончи личным выводом";
  return "в финале мягко скажи, что артикул или код можно найти в описании; если номера нет в данных, не выдумывай его";
}
