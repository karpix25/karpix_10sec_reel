import type { CtaMode } from "@/lib/omni/creative-contract";
import type { OmniLegacyScenario } from "@/lib/omni/types";
import type { OmniAvatarSpeechGender } from "../../omni/avatar-speech-gender";
import { normalizeOmniWardrobeSource, type OmniWardrobeSource } from "../../omni/wardrobe-source";
import type { DirectorBrief } from "./director-analysis-types";
import { renderDirectorBriefForScriptPrompt, renderDirectorBriefForOmniPrompt } from "./director-analysis-prompt";
import type { OmniDurationRange } from "./omni-duration-range";
import type { CreativeScriptDraft, DirectorSegmentPlan } from "./llm-prompt-chain-types";
import { formatPromptChainRange } from "./llm-prompt-chain-number-words";
import { buildReferenceMeaningGuidance } from "./reference-meaning-contract";
import { renderRussianSpeechGenderRule } from "./russian-speech-gender-contract";
import { OMNI_PHYSICAL_ACTION_CONTRACT } from "./omni-physical-action-contract";

export type PromptChainInput = {
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
};

export function buildCreativeCopywriterPrompt(input: PromptChainInput) {
  const referenceMeaningGuidance = buildReferenceMeaningGuidance(input.sourceScenario.script);
  return `
Ты креативный сценарист коротких вертикальных видео.

Задача: написать только живой русский voiceover сценарий для говорящего человека.
Не возвращай JSON. Не добавляй заголовки, пояснения, markdown или варианты.

Критерии:
Пиши как человек записывает короткое видео другу, без канцелярита.
Начни с сильного хука через боль, контраст, парадокс или личное наблюдение.
Первая часть сценария повторяет механику reference: если original hook был с продуктом, наш hook тоже с продуктом; если original hook был без продукта, герой говорит без продукта.
${buildProductTimingContract(input.directorBrief || null)}
Сохрани разговорность, темп и конкретику.
Используй короткие, грамматически законченные предложения. Вопросительный и восклицательный знаки ставь только там, где они естественно задают интонацию.
Используй исходную транскрибацию reference-видео как смысловую основу, а не как отвлеченную тему.
Перед написанием сделай внутреннюю карту reference: главный тезис, вопрос или возражение, механизм или объяснение "почему это работает", конкретные доказательства или примеры, порядок смысловых шагов и финальный вывод. Не показывай эту карту, но проверь по ней итоговый текст.
Сохрани смысловые опоры, порядок мыслей, разговорную подачу, главный тезис, вопрос или возражение, механизм, доказательство или пример и тип финала. Не пытайся сохранить большую часть фраз дословно. Если сохранение фраз конфликтует с лимитом длины, приоритет имеют лимит и смысл, а не формулировки.
Фокус сценария на нашем продукте:
Если в reference перечисляется список советов, шагов или ошибок (например, три правила ухода или три ошибки), а наш продукт закрывает только одну конкретную потребность (например, мягкое очищение, а не защита от солнца и кислоты):
- Адаптируй всю тему и шаги ролика вокруг сферы применения нашего продукта (например: «три главных правила правильного очищения кожи» или «ошибки при умывании, разрушающие барьер»),
- Либо сделай так, чтобы наш продукт являлся главным практическим решением всей проблемы ролика.
Категорически запрещено после представления нашего продукта переходить к детальному разбору посторонних тем или категорий товаров (например, давать советы про SPF и ретинол, пока ролик рекламирует пенку для умывания).
Сделай минимальную редактуру. Меняй слова синонимами только там, где это нужно для нашего продукта, грамматики или безопасности. Не добавляй новые рекламные аргументы и не перестраивай повестку reference.
Если нужно сократить текст до четырех частей, убирай только повторы, вводные слова и лишнюю многословность. Объединяй близкие предложения, но не выбрасывай механизм, конкретный пример, доказательство или вывод и не заменяй их общей рекламной фразой.
Если в reference уже есть чужой продукт, не копируй его название, бренд, упаковку и свойства. Сохрани его сценарную роль: предмет в списке, пример, демонстрация, доказательство или главный объект, и замени эту роль нашим продуктом.
Если автор reference говорит, что он врач, косметолог, нутрициолог, эксперт, специалист или другой профессионал, не переноси эту роль на аватара. Убери такую фразу или замени ее на нейтральную бытовую подачу от первого лица.
Не превращай полезный reference в отдельный сухой рекламный питч продукта.
Продукт обязан выполнять понятную функцию в мысли сценария: пример, инструмент, привычка, решение, демонстрация или способ не ошибиться с выбором.
Не выдумывай ссылки, артикулы, скидки или факты, которых нет во входных данных.
${renderRussianSpeechGenderRule(input.avatarSpeechGender)}
${buildDurationLine(input.durationRange)}
Не делай больше четырех частей. Если исходный reference длиннее, сожми текст, сохранив его хук, смысл продукта, ключевой аргумент и CTA.
CTA: ${buildCtaLine(input.ctaMode, input.ctaValue)}

Бренд: ${input.projectName}
Целевая аудитория: ${input.targetAudience || "не указана"}
Tone of voice: ${input.brandVoice || "живой, простой, уверенный"}

Продукт: ${input.productName}
Описание продукта: ${input.productDescription || "не указано"}
Заметки по продукту: ${input.productReferenceNotes || "не указаны"}

Reference transcript:
${input.sourceScenario.script}

${referenceMeaningGuidance}

${renderDirectorBriefForScriptPrompt(input.directorBrief || null)}
`.trim();
}

export function buildDirectorSegmenterPrompt(input: {
  chainInput: PromptChainInput;
  draft: CreativeScriptDraft;
}) {
  return `
Ты режиссер монтажа для Gemini Omni.

Возьми готовый сценарий и раздели его на Omni segments для формата talking_head_cutaways.
Верни только валидный JSON без markdown.

Правила режиссуры:
Каждый segment строится storyboard first и может длиться четыре, шесть, восемь или десять секунд.
Итоговый план содержит не больше четырех segments. Если готовый сценарий длиннее, сожми его до четырех segments, не выбрасывая хук, смысл продукта и CTA.
Количество storyboard frames зависит от duration_seconds: четыре секунды это два кадра, шесть секунд это три кадра, восемь секунд это четыре кадра, десять секунд это пять кадров.
Каждый frame содержит ровно три, четыре или пять слов финальной русской речи в spoken_words.
Склейка spoken_words всех frames должна дословно совпадать с voiceover segment.
Первый frame обычно face_open. Последний frame обычно face_return. Product_cutaway или environment_cutaway добавляй только в тот frame, где смысл spoken_words и соответствующий момент reference действительно получают от этого визуальную пользу; позиция кадра сама по себе не является причиной для перебивки.
Первый segment повторяет механику reference: если original hook был с продуктом, наш продукт виден и произносится в первом segment; если original hook был без продукта, герой с пустыми руками и товар вне кадра.
${buildProductTimingContract(input.chainInput.directorBrief || null)}
Cutaway frames не могут показывать персонажа, который смотрит в камеру. Не создавай пустой кадр одного помещения или фона: если у reference нет подходящего предметного или атмосферного действия, оставь героя в кадре и обогати его жестом, реакцией, сменой крупности или ракурса.
Каждый talking head frame с ролью face_open или face_return показывает героя, который смотрит прямо в объектив при любом разрешенном ракурсе камеры.
В каждом frame опиши visual_description, camera, action, product_state, sfx и reference_role. Visual_description должен быть конкретной видимой сценой, которая прямо раскрывает смысл spoken_words этого frame, а не универсальной демонстрацией продукта.
SFX это только естественные звуки кадра. Музыку для Omni не планируй: без фоновой музыки, джинглов и музыкальных эффектов.
Слова spoken_words будут написаны прямо на визуальном кадре storyboard image и станут единственным источником русской речи для Omni.
В spoken_words не добавляй лишние слова: только точная реплика кадра, три, четыре или пять слов.
Каждый frame описывает только физическую сцену, камеру, действие и естественный звук внутри кадра.
Выбирай product_cutaway и удерживание продукта в руках только когда смысл spoken_words этого кадра прямо связан с продуктом, его свойствами или применением. Если фраза посвящена общей теме, проблеме или выводу без прямого контакта с продуктом, продукт должен быть вне кадра (product_state: "вне кадра"), а персонаж говорит с естественной жестикуляцией без товара в руках. В product_cutaway продукт обязан быть физически видимым и детально совпадать с product reference.
Для непредметных кадров переноси конкретный визуальный приём из соответствующего reference-кадра, но адаптируй его под текущую реплику без чужого продукта.
Одежда, свет, окружение и типаж героя должны быть едиными во всех frames одного ролика.
Бери камеру и переходы из соответствующих reference-кадров. Если соседние кадры reference сняты одинаково, повторяй тот же ракурс, фон и направление камеры. Не добавляй автоматическое чередование лево-право, смену крупности или движение камеры только ради динамики.
Каждый segment обязан содержать законченную грамматическую мысль и завершаться полным предложением со знаком препинания (точка, восклицательный или вопросительный знак).
Категорически запрещено разрывать предложение между сегментами (например, обрывать фразу на предлоге или прилагательном вроде «в вечернем», «для мягкого», «и третье»). Каждая фраза, начатая в сегменте, должна быть полностью закончена внутри этого же сегмента.
Запрещено заканчивать segment союзами, предлогами, местоимениями или незавершенными оборотами (и, а, но, в, на, для, с, чтобы, если, в вечернем, это, такие, сможете, помогает).
${renderRussianSpeechGenderRule(input.chainInput.avatarSpeechGender)}
В segment без продуктовой демонстрации продукт остается либо вне кадра, либо в одном стабильном положении. В segment с демонстрацией опиши физическую последовательность: на поверхности, рука подходит, касается, берет, затем держит.
Если cutaway frame говорит без рук, весь segment не должен включать взятие продукта в руки.
${OMNI_PHYSICAL_ACTION_CONTRACT}
Аватарный character_id передается Omni отдельно. Product reference передается Omni отдельно. Не пиши идентификаторы или ссылки в JSON.
Все числа в текстовых значениях JSON пиши словами. Не используй emoji, дефисы, тире или минусы.

Длительность:
${buildDurationLine(input.chainInput.durationRange)}
Используй duration_seconds только как числовое поле JSON. В текстовых полях числа пиши словами.

Продукт: ${input.chainInput.productName}
Описание продукта: ${input.chainInput.productDescription || "не указано"}
Заметки: ${input.chainInput.productReferenceNotes || "не указаны"}

Готовый сценарий:
${input.draft.script}

Верни JSON:
{
  "title": "короткий заголовок",
  "hook_options": ["вариант хука словами", "вариант хука словами", "вариант хука словами"],
  "selected_hook": "выбранный хук",
  "total_voiceover": "полный сценарий из voiceover сегментов",
  "segments": [
    {
      "index": 1,
      "duration_seconds": 8,
      "voiceover": "точная речь сегмента",
      "product_state": "единое физическое состояние продукта в этом сегменте",
      "storyboard_frames": [
        {
          "index": 1,
          "role": "face_open",
          "spoken_words": "три, четыре или пять слов",
          "visual_description": "детальное описание кадра, света, окружения и персонажа",
          "camera": "крупность, движение и ракурс камеры",
          "action": "конкретное действие в кадре",
          "product_state": "физическое состояние продукта в этом кадре",
          "sfx": "естественный бытовой звук кадра",
          "reference_role": "avatar"
        }
      ],
      "shots": [
        { "role": "face_open", "action": "действие лица в камеру" },
        { "role": "cutaway", "action": "перебивка на продукт, предмет или среду" },
        { "role": "face_return", "action": "возврат к лицу для завершения мысли" }
      ],
      "end_state": "как заканчивается сегмент для следующей части"
    }
  ],
  "notes": "короткое объяснение режиссерской логики"
}
`.trim();
}

export function buildProviderPromptWriterPrompt(input: {
  chainInput: PromptChainInput;
  directorPlan: DirectorSegmentPlan;
}) {
  const wardrobeSource = normalizeOmniWardrobeSource(input.chainInput.wardrobeSource);
  const wardrobeRule = wardrobeSource === "avatar_reference"
    ? "Одежда берется только из аватара. Не копируй одежду reference."
    : "Одежду адаптируй из reference, но не меняй лицо и идентичность персонажа.";

  return `
Ты prompt режиссер для Gemini Omni.

Напиши готовый цельный provider prompt для каждого segment.
Код не будет склеивать PRODUCT ACTION, SCENE ACTION или CONTINUITY. Каждый prompt должен быть самодостаточным и физически непротиворечивым.
Верни только валидный JSON без markdown.

Общие правила:
Русская речь в voiceover должна совпадать с director plan дословно.
${renderRussianSpeechGenderRule(input.chainInput.avatarSpeechGender)}
Каждый provider segment обязан нести storyboard_frames по правилу duration_seconds делить на два.
Склейка spoken_words всех storyboard_frames должна дословно совпадать с voiceover.
Каждый frame должен сохранить три, четыре или пять слов финальной русской речи, детальный визуал, camera, action, product_state, sfx и reference_role.
Provider prompt должен описывать storyboard как последовательные кадры по две секунды.
Omni должен сгенерировать русскую речь и естественные SFX. Omni не должен генерировать музыку, фоновые треки, джинглы или музыкальные эффекты.
Наша фоновая музыка добавляется после из библиотеки, поэтому в prompt пиши только no music и natural SFX.
Final provider prompt должен быть коротким: используй storyboard image как главный референс и не дублируй детали каждого кадра словами.
Final provider prompt не должен содержать прямой текст voiceover. Он должен просить персонажа читать только реплики, написанные в кадрах раскадровки.
Final provider prompt должен запретить показ самой раскадровки: никаких панелей, номеров кадров, черного фона, служебных подсказок, карточек и коллажа.
Final provider prompt описывает только физически видимые сцены, камеру, действия и естественные звуки.
Product cutaway используй только когда смысл текущих spoken_words требует показать продукт. В остальных cutaway продукт остается вне кадра. Если product cutaway выбран, продукт обязан быть физически видимым и детально совпадать с product reference.
Character_id аватара передается отдельно. Product reference передается отдельно. Не вставляй ссылки или идентификаторы в prompt.
В финальном prompt не упоминай названия платформ и интерфейсы приложений.
${wardrobeRule}
Сохрани единый avatar, outfit, свет и окружение между frames и segment prompts. Материал одежды, плетение ткани, плотность, фактура, крой и детали должны быть в точности одинаковыми во всех частях.
Момент первого появления продукта совпадает с reference. Если продукт нужен в первом segment, бери его только из product reference; если в reference продукт появляется позже, первый segment показывает героя без продукта.
Речь каждого segment это одна непрерывная реплика. Каждый следующий кадр продолжает ее со следующего еще не произнесенного слова. После последнего слова персонаж замолкает.
Сохрани естественную динамику UGC из reference: живые жесты, реакции и конкретные смысловые действия. Визуальный переход используй только там, где он есть в reference; при отсутствии перехода оставь стабильный непрерывный ракурс без рекламной постановки.
Все числа в текстовых значениях JSON пиши словами. Не используй emoji, дефисы, тире или минусы.
Если продукт на столе, не пиши что персонаж держит его в руках.
Если перебивка без рук, не пиши что рука двигает или берет продукт.
${OMNI_PHYSICAL_ACTION_CONTRACT}
Talking head prompt должен начинаться с лица, иметь короткую середину cutaway и возвращаться к лицу.

Продукт: ${input.chainInput.productName}
Описание продукта: ${input.chainInput.productDescription || "не указано"}
Заметки по продукту: ${input.chainInput.productReferenceNotes || "не указаны"}
Reference style:
${renderDirectorBriefForOmniPrompt(input.chainInput.directorBrief || null)}

Director plan:
${JSON.stringify(input.directorPlan, null, 2)}

Верни JSON:
{
  "segment_prompts": [
    {
      "index": 1,
      "duration_seconds": 8,
      "voiceover": "точная речь сегмента",
      "storyboard_frames": [
        {
          "index": 1,
          "role": "face_open",
          "spoken_words": "три, четыре или пять слов",
          "visual_description": "детальное описание кадра",
          "camera": "крупность и движение камеры",
          "action": "конкретное действие",
          "product_state": "физическое состояние продукта",
          "sfx": "естественный бытовой звук",
          "reference_role": "avatar"
        }
      ],
      "reference_role": "avatar",
      "prompt": "короткий prompt для Gemini Omni: читать только реплики из storyboard image, не показывать storyboard панели, natural SFX, no music"
    }
  ],
  "notes": "короткая заметка"
}
`.trim();
}

function buildDurationLine(durationRange?: OmniDurationRange) {
  if (!durationRange) return "Итоговый сценарий обычно должен быть плотным и коротким.";
  const secondsRange = formatPromptChainRange(durationRange.minSeconds, durationRange.maxSeconds);
  const wordsRange = formatPromptChainRange(durationRange.minWords, durationRange.maxWords);
  return [
    `Цель по ролику: ${secondsRange} секунд.`,
    `Текст: ${wordsRange} слов.`,
    "Не делай сценарий короче нижней границы. Не превышай сто слов и не создавай больше четырех частей.",
  ].join(" ");
}

function buildCtaLine(mode: CtaMode, value: string | null) {
  if (mode === "keyword_in_comments") return `встрой просьбу написать кодовое слово «${value}» в комментариях в момент органичного завершения мысли о продукте или в финале ролика`;
  if (mode === "link_in_profile") return `встрой ссылку в профиле${value ? `, цель ссылки: ${value}` : ""} в момент органичного завершения мысли о продукте или в финале ролика`;
  if (mode === "no_explicit_cta") return "без явного CTA, закончить личным выводом";
  return "нативно связать мысль о продукте с тем, что артикул или подробности можно найти в описании. Размести CTA там, где естественно завершается рассказ о продукте или как органичный итог ролика. Не используй сухие шаблоны; в описании упоминается только артикул, без ссылок и лишней информации.";
}

function buildProductTimingContract(brief: DirectorBrief | null): string {
  const intro = brief?.product_introduction;
  if (!intro) {
    return "Если в reference продукт не появляется в начале, не показывай и не называй наш продукт в первой части ролика — введи его только там, где это органично по смыслу.";
  }
  if (intro.relative_position === "never") {
    return "В reference продукт не показывается совсем. Наш продукт вводи только там, где он органично вписывается в смысл — не в начале, не ради демонстрации.";
  }
  const positionMap: Record<string, string> = {
    hook: "В reference продукт появляется с самого начала (хук). Наш продукт обязан присутствовать в первой части ролика.",
    body: `В reference продукт впервые появляется в середине (на ${intro.first_appearance_sec}с). Не упоминай и не показывай наш продукт в первой части — введи его только в середине сценария, когда это органично по смыслу.`,
    payoff: `В reference продукт появляется только в конце (на ${intro.first_appearance_sec}с). Первые части ролика полностью без продукта. Продукт вводи только в последней части.`,
  };
  return [
    positionMap[intro.relative_position] || "",
    intro.introduction_style ? `Способ появления в reference: ${intro.introduction_style}. Адаптируй этот способ под наш продукт — он должен появиться так же органично.` : "",
    intro.naturality_notes ? `Нативность из reference: ${intro.naturality_notes}.` : "",
  ].filter(Boolean).join(" ");
}
