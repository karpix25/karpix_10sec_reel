import type { CtaMode } from "@/lib/omni/creative-contract";
import type { OmniLegacyScenario } from "@/lib/omni/types";
import { normalizeOmniWardrobeSource, type OmniWardrobeSource } from "../../omni/wardrobe-source";
import type { DirectorBrief } from "./director-analysis-types";
import { renderDirectorBriefForScriptPrompt } from "./director-analysis-prompt";
import type { OmniDurationRange } from "./omni-duration-range";

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
  directorBrief?: DirectorBrief | null;
  wardrobeSource?: OmniWardrobeSource;
  durationRange?: OmniDurationRange;
  retryFeedback?: string | null;
}) {
  const durationInstruction = buildDurationInstruction(input.durationRange);
  const wardrobeSource = normalizeOmniWardrobeSource(input.wardrobeSource);
  const directorGuidance = wardrobeSource === "avatar_reference"
    ? removeDirectorWardrobeGuidance(renderDirectorBriefForScriptPrompt(input.directorBrief || null))
    : renderDirectorBriefForScriptPrompt(input.directorBrief || null);
  const visualCueInstruction = buildVisualCueInstruction(wardrobeSource);
  const visualCueExample = wardrobeSource === "avatar_reference"
    ? "главный персонаж в одежде аватара, со светом, фоном и камерой reference-видео смотрит в камеру; без субтитров"
    : "главный персонаж в одежде и свете reference-видео смотрит в камеру; конкретный фон и камера из reference; без субтитров";
  return `
Создай 1 новый сценарий для Instagram Reels по методологии reels-script-writer.

Правила:
1. Используй исходную транскрибацию reference-видео только как пример структуры: хук, порядок смысловых битов и тип финала. Темп речи, паузы, подачу и монтаж оригинала не копируй.
2. Новый сценарий должен продвигать выбранный продукт.
3. Формат: говорящая голова.
4. Структура: кульминационный хук 0-3 сек, 2-3 плотных бита, один CTA.
5. CTA: ${buildCtaInstruction(input.ctaMode, input.ctaValue)}
6. Не добавляй второй CTA и не меняй выбранное действие. Если для CTA нужны конкретные данные и их нет, не выдумывай их.
7. Не используй дешевый кликбейт: "СТОП", "не листай", "99% людей", "секрет, который скрывают", "досмотри до конца".
8. Не используй ни один длинный знак тире: —, –, ‒, ―, −. Также не используй слова "является", "в современном мире", "стоит отметить", "важно понимать".
9. Не добавляй emoji ни в одно поле JSON.
10. Пиши бытовым русским языком. Одна мысль в одной строке.
11. ${durationInstruction}
12. Планируй речь по фактической скорости KIE Gemini Omni около 2.45 полезных слов в секунду: 4с до 9 слов, 6с до 14 слов, 8с до 19 слов, 10с до 24 слов.
13. Не пиши псевдовопросы без ответа и фальшивую эмпатию вроде "я знаю, как тебе сложно".
14. Сначала придумай 3 разных кульминационных hook_options, затем выбери strongest selected_hook.
15. Разбей сценарий на 2-4 beats. В каждом beat должны быть:
    - visual_cue: конкретный кадр для режиссера, включая адаптированную одежду, фон, свет, камеру, локацию и действие.
    - voiceover: точная произносимая реплика этого бита.
16. ${visualCueInstruction}
17. Если оригинальный продукт или процесс из reference-видео не совпадает с новым продуктом, замени его на новый продукт. Не копируй чужие B-roll процессы, еду, инструменты, рабочие сцены или случайные предметы.
18. Поле script должно совпадать с beats.voiceover, склеенными по порядку.
19. Поле background_audio_mood выбери строго из списка: energetic, calm, dramatic, inspiring, playful, serious.

Бренд: ${input.projectName}
Целевая аудитория: ${input.targetAudience || "не указана"}
Tone of voice: ${input.brandVoice || "не указан"}

Продукт: ${input.productName}
Описание продукта: ${input.productDescription || "не указано"}
Заметки по продукту: ${input.productReferenceNotes || "не указаны"}

Оригинальная транскрибация reference-видео:
${input.sourceScenario.script}
${directorGuidance ? `\n${directorGuidance}` : ""}
${input.retryFeedback ? `\nПовторная попытка:\n${input.retryFeedback}` : ""}

Верни JSON строго такого вида:
{
  "title": "короткий заголовок сценария",
  "hook_options": ["вариант хука 1", "вариант хука 2", "вариант хука 3"],
  "selected_hook": "выбранный самый сильный хук",
  "hook": "кульминационный хук",
  "beats": [
    {
      "stage": "hook",
      "visual_cue": "${visualCueExample}",
      "voiceover": "точная первая реплика"
    },
    {
      "stage": "body",
      "visual_cue": "перебивка или возврат к лицу строго по визуальному ритму reference; если продукт виден, это новый продукт",
      "voiceover": "точная реплика бита"
    },
    {
      "stage": "cta",
      "visual_cue": "финальный кадр по reference-стилю; без текста на экране",
      "voiceover": "точная CTA-реплика"
    }
  ],
  "script": "полный сценарий одной строкой или многострочным текстом; не массив и не объект",
  "caption": "описание поста в соответствии с выбранным CTA; без выдуманных номеров и ссылок",
  "cta_keyword": "кодовое слово только для CTA через комментарии; иначе пустая строка",
  "lead_magnet": "пустая строка, если отдельного подарка нет",
  "background_audio_mood": "одно значение: energetic, calm, dramatic, inspiring, playful или serious"
}
`;
}

function buildDurationInstruction(durationRange?: OmniDurationRange) {
  if (!durationRange) {
    return "Целевая длина сценария: обычно 48-72 слова. Система сама выберет длительность каждой части из 4, 6, 8 или 10 секунд.";
  }

  const clampedNote = durationRange.wasClamped
    ? ` Настройка клиента ${durationRange.requestedMinSeconds}-${durationRange.requestedMaxSeconds} сек выходит за текущий Omni-лимит 8-40 сек, поэтому пиши под ${durationRange.minSeconds}-${durationRange.maxSeconds} сек.`
    : "";
  return (
    `Целевая длительность итогового ролика: ${durationRange.minSeconds}-${durationRange.maxSeconds} сек. ` +
    `Целевая длина произносимого текста: ${durationRange.minWords}-${durationRange.maxWords} слов.${clampedNote} ` +
    "Система сама выберет 2-4 части и длительность каждой части из 4, 6, 8 или 10 секунд."
  );
}

function buildVisualCueInstruction(wardrobeSource: OmniWardrobeSource) {
  if (wardrobeSource === "avatar_reference") {
    return [
      "Если есть режиссерский анализ reference-видео, visual_cue должен использовать локацию, окружение, свет и камеру reference-видео. Если в reference меняется локация, отрази смену по beats.",
      "Одежду reference-видео не копируй: одежда главного персонажа всегда берется из аватара и должна оставаться одинаковой во всех beats.",
      "Монтажный ритм и темп речи reference-видео не копируй. Пиши простую живую речь под новый продукт. Не добавляй субтитры, оверлеи, интерфейсы или текст на экране.",
    ].join(" ");
  }
  return "Если есть режиссерский анализ reference-видео, visual_cue должен использовать адаптированную одежду главного персонажа, локацию, окружение, свет и камеру reference-видео. Если в reference меняется локация, отрази смену по beats. Монтажный ритм и темп речи reference-видео не копируй. Пиши простую живую речь под новый продукт. Не добавляй субтитры, оверлеи, интерфейсы или текст на экране.";
}

function removeDirectorWardrobeGuidance(guidance: string) {
  return guidance
    .split("\n")
    .filter((line) => !/^\s*- Одежда:/iu.test(line))
    .join("\n")
    .trim();
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
