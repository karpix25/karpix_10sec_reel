import type { CtaMode } from "@/lib/omni/creative-contract";
import type { OmniLegacyScenario } from "@/lib/omni/types";
import type { OmniAvatarSpeechGender } from "../../omni/avatar-speech-gender";
import { normalizeOmniWardrobeSource, type OmniWardrobeSource } from "../../omni/wardrobe-source";
import type { DirectorBrief } from "./director-analysis-types";
import { renderDirectorBriefForScriptPrompt } from "./director-analysis-prompt";
import type { OmniDurationRange } from "./omni-duration-range";
import { buildReferenceMeaningGuidance } from "./reference-meaning-contract";
import { renderRussianSpeechGenderRule } from "./russian-speech-gender-contract";
import { isVoiceoverMontageReference, resolveReferenceFormatMode } from "./omni-reference-format-mode";

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
  const referenceFormatMode = resolveReferenceFormatMode(input.directorBrief);
  const montageReference = isVoiceoverMontageReference(referenceFormatMode);
  const visualCueInstruction = buildVisualCueInstruction(wardrobeSource, montageReference, input.directorBrief);
  const referenceMeaningGuidance = buildReferenceMeaningGuidance(input.sourceScenario.script);
  const visualCueExample = wardrobeSource === "avatar_reference"
    ? "сохраненный аватар в самостоятельной сцене по смыслу реплики; общий визуальный язык референса; без субтитров"
    : "сохраненный аватар в самостоятельной сцене по смыслу реплики; без субтитров";
  return `
Создай один новый сценарий для Instagram Reels по методологии сценариста Reels.

Правила:
1. Используй исходную транскрибацию reference-видео как почти готовый текст, а не как тему для нового сценария. Сохрани смысловые опоры, порядок мыслей, разговорную подачу, главный тезис, вопрос или возражение, механизм, доказательство или пример и тип финала. Не пытайся сохранить большую часть фраз дословно. Если сохранение фраз конфликтует с лимитом длины, приоритет имеют лимит и смысл, а не формулировки. Сделай минимальную редактуру. Меняй слова синонимами только там, где это нужно для нашего продукта, грамматики или безопасности. Не добавляй новые рекламные аргументы и не перестраивай повестку. Темп речи, паузы, подачу и монтаж оригинала не копируй.
1а. Перед написанием сделай внутреннюю карту reference: один главный тезис, вопрос или возражение, механизм или объяснение "почему это работает", конкретные доказательства или примеры, порядок смысловых шагов и финальный вывод. Не показывай эту карту в ответе, но проверь по ней каждый beat. В итоговом сценарии должна остаться каждая важная смысловая опора оригинала.
1б. Если нужно сократить текст до пяти частей, сокращай повторы, вводные слова и длинные формулировки, а не идеи. Объединяй близкие предложения в один плотный beat. Не заменяй конкретный механизм, пример или доказательство общей фразой вроде "это полезно" или "помогает лучше себя чувствовать".
2. Reference задает смысловую структуру, тип хука, общий формат и визуальный язык. Точные сцены, локации, действия, одежду, камеру и тайминги поставь заново под новый сценарий. Чужой продукт не копируй.
3. Переписывай reference близко: оставь его повестку и порядок пунктов, а продукт вставь как нативную замену исходного объекта или как один дополнительный уместный пункт. Если в reference уже есть чужой продукт, не копируй его название, бренд, упаковку и свойства. Сохрани его сценарную роль: предмет в списке, пример, демонстрация, доказательство или главный объект, и замени эту роль нашим продуктом только там, где это логично. Не превращай полезный reference в отдельный рекламный питч продукта.
3а. Если автор reference говорит, что он врач, косметолог, нутрициолог, эксперт, специалист или другой профессионал, не переноси эту роль на аватара. Убери такую фразу или замени ее на нейтральную бытовую подачу от первого лица.
4. Продукт обязан выполнять понятную функцию в мысли сценария: пример, инструмент, привычка, решение, демонстрация или способ не ошибиться с выбором. Нельзя просто вставить продукт и CTA между двумя полезными фразами.
4а. Перед упоминанием продукта добавь короткий причинный мостик от ситуации, потребности или выбора из reference к продукту. После названия покажи подтвержденную пользу именно для этой ситуации. Если фразу о продукте можно удалить без потери логики, перепиши переход.
5. Новый сценарий должен продвигать выбранный продукт. В произносимом voiceover обязательно назови продукт точным названием «${input.productName}» минимум один раз и объясни его конкретную пользу. «Ссылка в профиле», «ссылка в описании» и похожий CTA не заменяют название продукта.
5а. Если в первой части reference продукт не назван, не вставляй его искусственно в хук, но назови «${input.productName}» в том месте, где впервые появляется практическое решение. До CTA зритель должен понимать, что это за продукт и зачем он нужен.
6. Базовый формат: ${montageReference ? "закадровый голос с независимыми монтажными сценами" : "говорящая голова с короткими смысловыми перебивками"}. Это макроориентир, а не контракт точных кадров и таймингов.
7. Структура: кульминационный хук 0-3 сек, 2-3 плотных бита, один CTA. Итоговый сценарий должен укладываться в 2-5 частей, не создавай шестую часть.
8. CTA: ${buildCtaInstruction(input.ctaMode, input.ctaValue)}
9. Не добавляй второй CTA и не меняй выбранное действие. Если для CTA нужны конкретные данные и их нет, не выдумывай их.
10. Не используй дешевый кликбейт: "СТОП", "не листай", "99% людей", "секрет, который скрывают", "досмотри до конца".
11. В текстовых значениях JSON не используй дефисы, тире и минусы: -, —, –, ‒, ―, −. Если нужен разделитель, ставь запятую или точку. Также не используй слова "является", "в современном мире", "стоит отметить", "важно понимать".
12. Не добавляй emoji ни в одно поле JSON.
13. Все числа в текстовых значениях JSON пиши словами, не цифрами. Пример: "тридцать секунд", а не "30 сек".
14. Пиши бытовым русским языком. Одна мысль в одной строке.
15. ${renderRussianSpeechGenderRule(input.avatarSpeechGender)}
16. ${durationInstruction}
17. Планируй речь по фактической скорости KIE Gemini Omni около 2.45 полезных слов в секунду: 4с до 9 слов, 6с до 14 слов, 8с до 19 слов, 10с до 24 слов.
18. Не пиши псевдовопросы без ответа и фальшивую эмпатию вроде "я знаю, как тебе сложно".
19. Сначала придумай 3 разных кульминационных hook_options, затем выбери strongest selected_hook.
20. Разбей сценарий на 2-4 beats. В каждом beat должны быть:
    visual_cue: одна конкретная видимая сцена, которая прямо раскрывает смысл voiceover этого beat, включая локацию, фон, свет, камеру и простое действие. ${renderWardrobeContinuityRule(input.directorBrief)}
    voiceover: точная произносимая реплика этого бита.
21. ${visualCueInstruction}
22. Для каждого visual_cue сначала пойми смысл текущего voiceover, затем покажи именно этот смысл через персонажа, предметы или окружение. Продукт показывай только когда текущая реплика говорит о самом продукте, его свойствах или применении. Остальные темы показывай самостоятельной тематической сценой без продукта. Не копируй из reference несвязанные с текущей репликой процессы и предметы.
23. Поле script должно совпадать с beats.voiceover, склеенными по порядку.
24. Пиши без канцелярита и грамматических склеек. Нельзя: "продукт поддержать", "в идеале выбор зависит", повторять одно описательное слово продукта три раза.
25. Перед финальным JSON проверь все текстовые значения: нет emoji, нет дефисов, нет тире, нет минусов, нет цифр.
26. Поле background_audio_mood выбери строго из списка: energetic, calm, dramatic, inspiring, playful, serious.
27. Первый beat сохраняет тип и силу original hook, но получает новую сцену. Продукт появляется только в кадре, где текущая реплика объясняет конкретную потребность, выбор или применение продукта. Не создавай отдельную рекламную вставку и не требуй появления продукта в середине.
28. Используй короткие законченные предложения. Вопросительный и восклицательный знаки ставь только там, где они естественно задают интонацию.
29. В visual_cue описывай только то, что физически находится и происходит внутри кадра: сцену, композицию, камеру и простое действие.

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
    return "Целевая длина сценария: обычно 48-72 слова. Система сама выберет длительность 2-5 частей из 4, 6, 8 или 10 секунд. Никогда не превышай 125 слов: если исходник длиннее, сожми его, сохранив хук, смысл продукта и CTA.";
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
    `Ориентир длины произносимого текста: ${durationRange.minWords}-${durationRange.maxWords} слов.${exactDurationNote}${clampedNote} ` +
    `Для плотной подачи ориентир: ${targetMinWords}-${durationRange.maxWords} слов. ` +
    `Перед ответом проверь: сумма всех beats.voiceover и поле script должны совпадать по смыслу дословно. ` +
    "Система сама выберет 2-5 частей. Если исходник длиннее лимита, сожми формулировки до верхней границы диапазона, сохранив хук, смысл продукта, ключевые аргументы и CTA. Не добавляй дополнительные части и не пытайся сохранить исходные фразы дословно."
  );
}

function buildVisualCueInstruction(wardrobeSource: OmniWardrobeSource, montageReference = false, brief?: DirectorBrief | null) {
  const montageRule = montageReference
    ? "Для voiceover_montage каждый beat может быть новой самостоятельной сценой, созданной под текущую реплику."
    : "Для continuous_story можно сохранить одну понятную сцену с короткими оригинальными перебивками.";
  if (wardrobeSource === "avatar_reference") {
    return [
      "Создавай visual_cue заново под смысл voiceover. Из reference бери только макроформат, настроение света и примерную энергию монтажа.",
      "Главный человек в кадре это сохраненный аватар. Фоновые прохожие допустимы и не являются новым главным персонажем.",
      montageRule,
      "Не копируй точные локации, одежду, действия, реквизит и тайминги reference. Не добавляй субтитры, оверлеи или текст на экране.",
    ].join(" ");
  }
  return `Создавай visual_cue заново под смысл voiceover. Из reference бери только макроформат, настроение света и примерную энергию монтажа. ${montageRule} Главный человек в кадре это сохраненный аватар. Не копируй точные локации, одежду, действия, реквизит и тайминги reference. Не добавляй субтитры, оверлеи или текст на экране.`;
}

function renderWardrobeContinuityRule(brief?: DirectorBrief | null) {
  switch (brief?.wardrobe_continuity || "unknown") {
    case "stable": return "Анализатор подтвердил стабильную одежду, сохрани один комплект.";
    case "changes_between_cuts": return "Анализатор подтвердил смену одежды между cut-ами, используй одежду соответствующего интервала.";
    case "not_visible": return "Одежда не видна, не добавляй её детали.";
    default: return "Анализатор не подтвердил непрерывность одежды, не выводи её из формата ролика.";
  }
}

function removeDirectorWardrobeGuidance(guidance: string) {
  return guidance
    .split("\n")
    .filter((line) => !/^\s*- (?:Одежда:|Одежда по таймлайну:)/iu.test(line))
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
  return "в момент первого естественного появления продукта нативно свяжи текущую полезную мысль с тем, что именно этот продукт можно найти или прочитать в описании. Выбери живую формулировку под контекст. Не используй готовые шаблонные формулировки; можно упомянуть артикул, название или сам вариант продукта; не произноси номер артикула. В описании упоминается только артикул, без ссылок, подробностей и дополнительной информации. После CTA продолжи полезную мысль, чтобы ролик не заканчивался продажей";
}
