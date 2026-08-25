import type { CtaMode } from "@/lib/omni/creative-contract";
import type { OmniLegacyScenario } from "@/lib/omni/types";
import type { OmniAvatarSpeechGender } from "../../omni/avatar-speech-gender";
import type { OmniWardrobeSource } from "../../omni/wardrobe-source";
import type { DirectorBrief } from "./director-analysis-types";
import { renderDirectorBriefForScriptPrompt } from "./director-analysis-prompt";
import type { OmniDurationRange } from "./omni-duration-range";
import type { OmniReelSegmentPlan } from "./omni-duration-planner";
import type { CreativeScriptDraft, DirectorSegmentPlan } from "./llm-prompt-chain-types";
import { formatPromptChainRange } from "./llm-prompt-chain-number-words";
import { buildReferenceMeaningGuidance } from "./reference-meaning-contract";
import { renderRussianSpeechGenderRule } from "./russian-speech-gender-contract";
import { isVoiceoverMontageReference, resolveReferenceFormatMode } from "./omni-reference-format-mode";
import { resolveReferenceSceneMode } from "./omni-reference-scene-mode";
import { renderVisibleSubjectPolicy, resolveDirectorVisibleSubjectPolicy } from "./director-visibility-policy";
import { requiresContinuousPresenterWardrobe } from "./director-wardrobe";

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
  const referenceFormatMode = resolveReferenceFormatMode(input.directorBrief);
  const formatInstruction = isVoiceoverMontageReference(referenceFormatMode)
    ? "Reference — voiceover montage: голос идёт за кадром, а независимые B-roll сцены могут меняться между репликами. Не связывай сцены в одну непрерывную историю и не требуй постоянного присутствия аватара."
    : "Reference — presenter format: сохраняй логику говорящей головы и добавляй только короткие смысловые перебивки, если они нужны текущей реплике.";
  return `
Ты креативный сценарист коротких вертикальных видео.

Задача: написать только живой русский voiceover сценарий для говорящего человека.
Не возвращай JSON. Не добавляй заголовки, пояснения, markdown или варианты.

Критерии:
Пиши как человек записывает короткое видео другу, без канцелярита.
Сначала определи форму хука reference. Сохрани её: утверждение остаётся утверждением, список остаётся списком, вопрос остаётся вопросом. Не превращай любой reference в шаблонный вопрос или универсальный кликбейт.
Первая часть сценария повторяет хук и механику reference без нашего продукта.
${buildProductTimingContract()}
${formatInstruction}
Сохрани разговорность, темп и конкретику.
Используй короткие, грамматически законченные предложения. Вопросительный и восклицательный знаки ставь только там, где они естественно задают интонацию.
Используй исходную транскрибацию reference-видео как смысловую основу, а не как отвлеченную тему.
Перед написанием сделай внутреннюю карту reference: главный тезис, вопрос или возражение, механизм или объяснение "почему это работает", конкретные доказательства или примеры, порядок смысловых шагов и финальный вывод. Не показывай эту карту, но проверь по ней итоговый текст.
Сохрани смысловые опоры, порядок мыслей, разговорную подачу, главный тезис, вопрос или возражение, механизм, доказательство или пример и тип финала. Не пытайся сохранить большую часть фраз дословно. Если сохранение фраз конфликтует с лимитом длины, приоритет имеют лимит и смысл, а не формулировки.
Фокус сценария на нашем продукте:
В произносимом voiceover обязательно назови продукт точным названием «${input.productName}» минимум один раз и объясни его конкретную пользу. Фраза «ссылка в профиле», «ссылка в описании» или другой CTA никогда не заменяет название продукта.
Конкретную пользу возьми дословно по смыслу из описания продукта: назови действие, которое зритель сможет выполнить. Общие обещания «без проблем», «проще», «удобнее» и «без ограничений» без такого действия не считаются пользой.
Не называй продукт в хуке. В середине сделай короткую рекламную вставку, после которой вернись к исходному сюжету. К финалу зритель должен понимать, что это за продукт и зачем он нужен.
Сначала раскрой обещание или вопрос хука и дай зрителю конкретный ответ. Упоминание продукта и CTA не считаются ответом на хук.
Не заменяй тему reference темой продукта. Рекламная вставка не обязана решать исходную проблему: назови только подтвержденное действие и пользу из описания продукта и заметок. Не добавляй свойства, гарантии, страны, цены, скидки или результаты, которых нет во входных данных.
CTA произнеси до полноценного финального вывода, завершающего главный тезис reference. После CTA обязательно должна прозвучать отдельная полезная заключительная фраза.
Финальная фраза после CTA должна быть утвердительным смысловым выводом, а не вопросом, приказом или новым призывом. «Забудь», «наслаждайся», «путешествуй», «попробуй» и «хочешь так же» не считаются выводом.
В финальном выводе назови главный объект или ответ reference и утверди его исходный тезис. Общая фраза только о пользе продукта не считается выводом reference.
Если хук обещает конкретное место, способ, цену или результат, обязательно назови этот ответ. Для подтверждения достаточно одного конкретного факта или примера из reference. Второй добавляй только когда без него теряется причинная связь.
Если в reference перечисляется список советов, шагов или ошибок, сохрани обещанное количество и каждый обязательный пункт по смыслу. Рекламная вставка и CTA не считаются пунктами списка.
Сделай минимальную редактуру. Меняй слова синонимами только там, где это нужно для нашего продукта, грамматики или безопасности. Не добавляй новые рекламные аргументы и не перестраивай повестку reference.
Если нужно сократить текст до пяти частей, убирай только повторы, вводные слова и лишнюю многословность. Объединяй близкие предложения, но не выбрасывай механизм, конкретный пример, доказательство или вывод и не заменяй их общей рекламной фразой.
Если в reference уже есть чужой продукт, не копируй его название, бренд, упаковку и свойства. Сохрани его сценарную роль: предмет в списке, пример, демонстрация, доказательство или главный объект, и замени эту роль нашим продуктом.
Если автор reference говорит, что он врач, косметолог, нутрициолог, эксперт, специалист или другой профессионал, не переноси эту роль на аватара. Убери такую фразу или замени ее на нейтральную бытовую подачу от первого лица.
Рекламная вставка должна быть короткой: название продукта, подтвержденная польза и CTA. Затем продолжи reference с того места, где остановился.
Не выдумывай ссылки, артикулы, скидки или факты, которых нет во входных данных.
${renderRussianSpeechGenderRule(input.avatarSpeechGender)}
${buildDurationLine(input.durationRange)}
Не делай больше пяти частей. Если исходный reference длиннее, сокращай только повторы и вводные слова. Не удаляй обязательный пункт списка, механизм, доказательство, ответ на хук или финальный вывод ради лимита.
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
  segmentPlan: OmniReelSegmentPlan;
}) {
  const referenceFormatMode = resolveReferenceFormatMode(input.chainInput.directorBrief);
  const referenceSceneMode = resolveReferenceSceneMode(input.chainInput.directorBrief);
  const montageReference = isVoiceoverMontageReference(referenceFormatMode);
  const wardrobeContinuity = input.chainInput.directorBrief?.wardrobe_continuity || "unknown";
  const visibleSubjectPolicy = resolveDirectorVisibleSubjectPolicy(input.chainInput.directorBrief);
  const presenterReference = visibleSubjectPolicy === "presenter";
  const segmentFormat = presenterReference ? "talking_head_cutaways" : "voiceover_broll";
  const frameRoleRule = presenterReference
    ? "Первый frame обычно face_open. Последний frame обычно face_return."
    : "Роли storyboard_frames только environment_cutaway или product_cutaway. Не добавляй face_open или face_return.";
  const subjectRule = renderVisibleSubjectPolicy(visibleSubjectPolicy);
  const exampleFrameRole = presenterReference ? "face_open" : "environment_cutaway";
  const exampleReferenceRole = visibleSubjectPolicy === "silent_avatar" ? "avatar" : presenterReference ? "avatar" : "none";
  const exampleFrameAction = presenterReference ? "действие лица в камеру" : "наблюдаемое действие объекта, среды или визуального героя";
  const wardrobeRule = renderPromptChainWardrobeRule(
    wardrobeContinuity,
    requiresContinuousPresenterWardrobe({ referenceFormatMode, referenceSceneMode }),
  );
  const formatRule = montageReference
    ? "Сохрани только макроформат montage и примерный темп смены планов. Сцены, действия, локации и порядок перебивок поставь заново под смысл текущего сценария."
    : presenterReference
      ? "Сохрани макроформат говорящей головы, но самостоятельно поставь сцену, жесты и короткие перебивки под новый сценарий."
      : `${renderVisibleSubjectPolicy(visibleSubjectPolicy)} Используй только общий визуальный язык reference и самостоятельно поставь сцены под новый сценарий.`;
  return `
Ты режиссер монтажа для Gemini Omni.

Возьми готовый сценарий и поставь его как Omni storyboard для формата ${segmentFormat}.
Верни только валидный JSON без markdown.

Правила режиссуры:
Каждый segment строится storyboard first и может длиться четыре, шесть, восемь или десять секунд.
Границы segments, duration_seconds и voiceover уже утверждены ниже. Копируй их дословно и не добавляй, не удаляй, не переставляй и не перефразируй слова.
total_voiceover должен дословно совпадать с готовым сценарием.
Количество storyboard frames зависит от duration_seconds: четыре секунды это два кадра, шесть секунд это три кадра, восемь секунд это четыре кадра, десять секунд это пять кадров.
Каждый frame содержит ровно три, четыре или пять слов финальной русской речи в spoken_words.
Склейка spoken_words всех frames должна дословно совпадать с voiceover segment.
${frameRoleRule} Product_cutaway или environment_cutaway добавляй только там, где он помогает смыслу spoken_words. Точный момент перебивки из reference не является обязательным.
${subjectRule}
Первый segment сохраняет силу и макроформат хука reference, но получает новую режиссерскую сцену под текущий текст. Наш продукт остается вне кадра до рекламной вставки в середине.
В итоговом voiceover каждого плана обязательно должно прозвучать точное название «${input.chainInput.productName}» и конкретная польза продукта. Фраза «ссылка в профиле», «ссылка в описании» или другой CTA не считается упоминанием продукта.
${buildProductTimingContract()}
Cutaway должен содержать конкретное наблюдаемое действие, но взгляд персонажа и точная подача не являются обязательным совпадением с reference.
${presenterReference ? "В talking head кадрах главным героем остается сохраненный аватар; позу, взгляд и жест выбирай под текущую реплику." : renderVisibleSubjectPolicy(visibleSubjectPolicy)}
В каждом frame опиши visual_description, camera, action, product_state, sfx и reference_role. Visual_description должен быть конкретной видимой сценой, которая прямо раскрывает смысл spoken_words этого frame, а не универсальной демонстрацией продукта.
SFX это только естественные звуки кадра. Музыку для Omni не планируй: без фоновой музыки, джинглов и музыкальных эффектов.
Слова spoken_words будут написаны прямо на визуальном кадре storyboard image и станут единственным источником русской речи для Omni.
В spoken_words не добавляй лишние слова: только точная реплика кадра, три, четыре или пять слов.
Каждый frame описывает только физическую сцену, камеру, действие и естественный звук внутри кадра.
Выбирай product_cutaway и удерживание продукта в руках только когда смысл spoken_words этого кадра прямо связан с продуктом, его свойствами или применением. Если фраза посвящена общей теме, проблеме или выводу без прямого контакта с продуктом, продукт должен быть вне кадра (product_state: "вне кадра"), а персонаж говорит с естественной жестикуляцией без товара в руках. В product_cutaway продукт обязан быть физически видимым и детально совпадать с product reference.
Для непредметных кадров создавай самостоятельную сцену, которая наглядно раскрывает текущую реплику. Из reference бери только общий визуальный язык без чужого продукта.
${formatRule} ${wardrobeRule}
Камеру, переходы и точные тайминги выбирай сам под ясность текущего сценария. Из reference сохрани только примерную энергетику, крупность и общий тип монтажа.
Мысль может естественно продолжаться между соседними segments. Не добавляй слова ради искусственного завершения фразы.
${renderRussianSpeechGenderRule(input.chainInput.avatarSpeechGender)}
В segment без продуктовой демонстрации продукт остается либо вне кадра, либо в одном стабильном положении. В segment с демонстрацией опиши физическую последовательность: на поверхности, рука подходит, касается, берет, затем держит.
Если cutaway frame говорит без рук, весь segment не должен включать взятие продукта в руки.
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

Утвержденные segments. Перенеси index, duration_seconds и voiceover без изменений:
${JSON.stringify(input.segmentPlan.segments.map((segment, index) => ({
    index: index + 1,
    duration_seconds: input.segmentPlan.segmentDurationsSeconds[index],
    voiceover: segment.text,
  })), null, 2)}

Верни JSON:
{
  "format": "${segmentFormat}",
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
          "role": "${exampleFrameRole}",
          "spoken_words": "три, четыре или пять слов",
          "visual_description": "детальное описание кадра, света, окружения и ${presenterReference ? "персонажа" : "наблюдаемого объекта, среды или визуального героя"}",
          "camera": "крупность, движение и ракурс камеры",
          "action": "${exampleFrameAction}",
          "product_state": "физическое состояние продукта в этом кадре",
          "sfx": "естественный бытовой звук кадра",
          "reference_role": "${exampleReferenceRole}"
        }
      ],
      "end_state": "как заканчивается сегмент для следующей части"
    }
  ],
  "notes": "короткое объяснение режиссерской логики"
}
`.trim();
}

export function buildDirectorSegmentRepairPrompt(input: {
  basePrompt: string;
  previousPlan: DirectorSegmentPlan;
  validationError: string;
  repairAttempt: number;
}) {
  return [
    input.basePrompt,
    "",
    `Точечная починка раскадровки, попытка ${input.repairAttempt}.`,
    `Ошибка проверки: ${input.validationError}`,
    "Исправь только поля, связанные с этой ошибкой.",
    "Верни ровно утвержденное количество segments с утвержденными index, duration_seconds и voiceover. Если текущий план потерял или продублировал segment, восстанови его по утвержденному списку выше.",
    "Не меняй title, hook_options, selected_hook или total_voiceover.",
    "Не меняй последовательность spoken_words. Разрешено только заново распределить те же слова утвержденного voiceover между storyboard_frames.",
    "Если ошибка визуальная, меняй только storyboard_frames, product_state и end_state.",
    "Текущий план:",
    JSON.stringify(input.previousPlan, null, 2),
    "Верни полный исправленный JSON плана.",
  ].join("\n");
}

function buildDurationLine(durationRange?: OmniDurationRange) {
  if (!durationRange) return "Итоговый сценарий обычно должен быть плотным и коротким.";
  const secondsRange = formatPromptChainRange(durationRange.minSeconds, durationRange.maxSeconds);
  const wordsRange = formatPromptChainRange(durationRange.minWords, durationRange.maxWords);
  return [
    `Цель по ролику: ${secondsRange} секунд.`,
    `Текст: ${wordsRange} слов.`,
    "Не делай сценарий короче нижней границы. Не превышай доступный лимит слов и не создавай больше пяти частей.",
  ].join(" ");
}

function buildCtaLine(mode: CtaMode, value: string | null) {
  if (mode === "keyword_in_comments") return `до финального вывода попросить написать кодовое слово «${value || "кодовое слово"}» в комментариях, затем закончить отдельной полезной утвердительной фразой`;
  if (mode === "link_in_profile") return `в момент естественного завершения мысли о продукте произнеси точную фразу «ссылка в профиле»${value ? `, цель ссылки: ${value}` : ""}; после CTA продолжи полезную мысль и закончи выводом, чтобы финальная часть ролика не состояла только из призыва; не упоминай описание, комментарии или кодовые слова`;
  if (mode === "no_explicit_cta") return "без явного CTA, закончить личным выводом";
  return "нативно связать мысль о продукте с тем, что артикул или подробности можно найти в описании. Размести CTA там, где естественно завершается рассказ о продукте, затем закончи отдельным полезным выводом. Не используй сухие шаблоны; в описании упоминается только артикул, без ссылок и лишней информации.";
}

function buildProductTimingContract(): string {
  return "Наш продукт появляется один раз короткой рекламной вставкой в середине сценария: после раскрытого начала reference и до его финального вывода. До вставки продукт вне кадра; после CTA вернись к исходной теме.";
}

function renderPromptChainWardrobeRule(
  continuity: DirectorBrief["wardrobe_continuity"] | "unknown",
  continuousPresenterWardrobe: boolean,
) {
  if (continuousPresenterWardrobe) return "Это один экранный ведущий: выбери ему один комплект одежды и не меняй тип одежды, рукава, вырез, цвет, материал или видимые аксессуары между segments.";
  if (continuity === "stable") return "Можно сохранить один простой комплект, но точный материал, крой и цвет reference не являются контрактом или причиной перегенерации.";
  if (continuity === "changes_between_cuts") return "Одежду можно менять между самостоятельными сценами, если это помогает новой режиссерской версии.";
  if (continuity === "not_visible") return "Одежда не видна в анализируемом reference: не добавляй и не проверяй детали одежды.";
  return "Выбери простой уместный outfit; точное совпадение одежды с reference не требуется.";
}
