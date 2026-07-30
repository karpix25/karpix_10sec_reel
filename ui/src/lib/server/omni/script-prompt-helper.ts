import type { CtaMode } from "@/lib/omni/creative-contract";
import type { OmniLegacyScenario } from "@/lib/omni/types";
import type { OmniAvatarSpeechGender } from "../../omni/avatar-speech-gender";
import { normalizeOmniWardrobeSource, type OmniWardrobeSource } from "../../omni/wardrobe-source";
import type { DirectorBrief } from "./director-analysis-types";
import { renderDirectorBriefForScriptPrompt } from "./director-analysis-prompt";
import type { OmniDurationRange } from "./omni-duration-range";
import { buildReferenceMeaningGuidance } from "./reference-meaning-contract";
import { renderRussianSpeechGenderRule } from "./russian-speech-gender-contract";

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
  avatarSpeechGender: OmniAvatarSpeechGender;
  retryFeedback?: string | null;
}) {
  const durationInstruction = buildDurationInstruction(input.durationRange);
  const wardrobeSource = normalizeOmniWardrobeSource(input.wardrobeSource);
  const directorGuidance = wardrobeSource === "avatar_reference"
    ? removeDirectorWardrobeGuidance(renderDirectorBriefForScriptPrompt(input.directorBrief || null))
    : renderDirectorBriefForScriptPrompt(input.directorBrief || null);
  const visualCueInstruction = buildVisualCueInstruction(wardrobeSource);
  const referenceMeaningGuidance = buildReferenceMeaningGuidance(input.sourceScenario.script);
  const visualCueExample = wardrobeSource === "avatar_reference"
    ? "главный персонаж в одежде аватара, со светом, фоном и камерой референса смотрит в камеру; без субтитров"
    : "главный персонаж в одежде и свете референса смотрит в камеру; конкретный фон и камера из референса; без субтитров";
  return `
Создай один новый сценарий для Instagram Reels по методологии сценариста Reels.

Правила:
1. Используй исходную транскрибацию reference-видео как смысловую основу. Сохрани главный тезис, вопрос или возражение, механизм, доказательство или пример, порядок аргументов и тип финала. Темп речи, паузы, подачу и монтаж оригинала не копируй.
2. Главный принцип адаптации reference: повторяй момент появления продукта из reference. Если в reference продукт появляется в первом кадре или первой фразе, покажи и назови наш продукт в первом beat. Если в reference продукт появляется позже, не показывай и не называй наш продукт раньше этого же момента. Чужой продукт всегда заменяй только нашим product reference.
3. Переписывай reference близко: оставь его повестку и порядок пунктов, а продукт вставь как нативную замену исходного объекта или как один дополнительный уместный пункт. Если в reference уже есть чужой продукт, не копируй его название, бренд, упаковку и свойства. Сохрани его сценарную роль: предмет в списке, пример, демонстрация, доказательство или главный объект, и замени эту роль нашим продуктом только там, где это логично. Не превращай полезный reference в отдельный рекламный питч продукта.
4. Новый сценарий должен продвигать выбранный продукт.
5. Формат: говорящая голова.
6. Структура: кульминационный хук 0-3 сек, 2-3 плотных бита, один CTA.
7. CTA: ${buildCtaInstruction(input.ctaMode, input.ctaValue)}
8. Не добавляй второй CTA и не меняй выбранное действие. Если для CTA нужны конкретные данные и их нет, не выдумывай их.
9. Не используй дешевый кликбейт: "СТОП", "не листай", "99% людей", "секрет, который скрывают", "досмотри до конца".
10. В текстовых значениях JSON не используй дефисы, тире и минусы: -, —, –, ‒, ―, −. Если нужен разделитель, ставь запятую или точку. Также не используй слова "является", "в современном мире", "стоит отметить", "важно понимать".
11. Не добавляй emoji ни в одно поле JSON.
12. Все числа в текстовых значениях JSON пиши словами, не цифрами. Пример: "тридцать секунд", а не "30 сек".
13. Пиши бытовым русским языком. Одна мысль в одной строке.
14. ${renderRussianSpeechGenderRule(input.avatarSpeechGender)}
15. ${durationInstruction}
16. Планируй речь по фактической скорости KIE Gemini Omni около 2.45 полезных слов в секунду: 4с до 9 слов, 6с до 14 слов, 8с до 19 слов, 10с до 24 слов.
17. Не пиши псевдовопросы без ответа и фальшивую эмпатию вроде "я знаю, как тебе сложно".
18. Сначала придумай 3 разных кульминационных hook_options, затем выбери strongest selected_hook.
19. Разбей сценарий на 2-4 beats. В каждом beat должны быть:
    visual_cue: одна конкретная видимая сцена, которая прямо раскрывает смысл voiceover этого beat, включая локацию, фон, свет, камеру и простое действие. Если персонаж виден, сохрани его одежду без изменений.
    voiceover: точная произносимая реплика этого бита.
20. ${visualCueInstruction}
21. Для каждого visual_cue сначала пойми смысл текущего voiceover, затем покажи именно этот смысл через персонажа, предметы или окружение. Продукт показывай только когда текущая реплика говорит о самом продукте, его свойствах или применении. Остальные темы показывай самостоятельной тематической сценой без продукта. Не копируй из reference несвязанные с текущей репликой процессы и предметы.
22. Поле script должно совпадать с beats.voiceover, склеенными по порядку.
23. Пиши без канцелярита и грамматических склеек. Нельзя: "продукт поддержать", "в идеале выбор зависит", повторять одно описательное слово продукта три раза.
24. Перед финальным JSON проверь все текстовые значения: нет emoji, нет дефисов, нет тире, нет минусов, нет цифр.
25. Поле background_audio_mood выбери строго из списка: energetic, calm, dramatic, inspiring, playful, serious.
26. Первый beat повторяет механику reference: если original hook был с продуктом, наш hook тоже с продуктом; если original hook был без продукта, герой говорит с пустыми руками. Не придумывай дизайн продукта, бери только выбранный product reference.
27. Используй короткие законченные предложения. Вопросительный и восклицательный знаки ставь только там, где они естественно задают интонацию.
28. В visual_cue описывай только то, что физически находится и происходит внутри кадра: сцену, композицию, камеру и простое действие.

Бренд: ${input.projectName}
Целевая аудитория: ${input.targetAudience || "не указана"}
Tone of voice: ${input.brandVoice || "не указан"}

Продукт: ${input.productName}
Описание продукта: ${input.productDescription || "не указано"}
Заметки по продукту: ${input.productReferenceNotes || "не указаны"}

Оригинальная транскрибация reference-видео:
${input.sourceScenario.script}

${referenceMeaningGuidance}
${directorGuidance ? `\n${directorGuidance}` : ""}
${input.retryFeedback ? `\nПовторная попытка:\n${input.retryFeedback}` : ""}

Верни JSON строго такого вида:
{
  "title": "короткий заголовок сценария",
  "hook_options": ["первый вариант хука", "второй вариант хука", "третий вариант хука"],
  "selected_hook": "выбранный самый сильный хук",
  "hook": "кульминационный хук",
  "beats": [
    {
      "stage": "hook",
      "visual_cue": "${visualCueExample}; продукт в кадре только если он был в первом кадре reference",
      "voiceover": "законченный хук, с продуктом только если продукт был в первом hook reference"
    },
    {
      "stage": "body",
      "visual_cue": "конкретная сцена, предмет или действие, которые визуализируют смысл этой реплики; продукт только если реплика требует его показа",
      "voiceover": "точная реплика бита; если здесь первое естественное появление продукта, CTA встроен внутрь мысли и после него продолжается польза"
    },
    {
      "stage": "cta",
      "visual_cue": "финальный кадр по стилю референса; без текста на экране",
      "voiceover": "финальный полезный вывод или продолжение мысли, если CTA уже прозвучал раньше"
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
  const exactDurationNote = durationRange.minSeconds === durationRange.maxSeconds
    ? ` Это точная настройка: итоговый voiceover не может быть короче ${durationRange.minWords} слов.`
    : "";
  const targetMinWords = Math.max(
    durationRange.minWords,
    Math.floor((durationRange.minWords + durationRange.maxWords) / 2)
  );
  return (
    `Целевая длительность итогового ролика: ${durationRange.minSeconds}-${durationRange.maxSeconds} сек. ` +
    `Целевая длина произносимого текста: ${durationRange.minWords}-${durationRange.maxWords} слов.${exactDurationNote}${clampedNote} ` +
    `Перед ответом проверь: сумма всех beats.voiceover и поле script должны быть ${targetMinWords}-${durationRange.maxWords} слов и совпадать по смыслу дословно. ` +
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
    return `в момент первого естественного появления продукта попроси написать кодовое слово «${value}» в комментариях; произнеси его точно. После CTA продолжи полезную мысль, чтобы ролик не заканчивался продажей`;
  }
  if (mode === "link_in_profile") {
    return `в момент первого естественного появления продукта мягко направь к ссылке в профиле${value ? `; назначение ссылки: ${value}` : ""}. После CTA продолжи полезную мысль, чтобы ролик не заканчивался продажей`;
  }
  if (mode === "no_explicit_cta") return "не добавляй явный призыв; закончи личным выводом";
  return "в момент первого естественного появления продукта коротко скажи, что главный продукт есть в описании, например «оставил его в описании». Если номера нет в данных, не выдумывай его. После CTA продолжи полезную мысль, чтобы ролик не заканчивался продажей";
}
