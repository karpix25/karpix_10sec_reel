import type { CtaMode } from "@/lib/omni/creative-contract";
import type { OmniLegacyScenario } from "@/lib/omni/types";
import type { OmniAvatarSpeechGender } from "../../omni/avatar-speech-gender";
import type { OmniWardrobeSource } from "../../omni/wardrobe-source";
import type { DirectorBrief } from "./director-analysis-types";
import type { OmniDurationRange } from "./omni-duration-range";
import type { OmniReelSegmentPlan } from "./omni-duration-planner";
import type { CreativeScriptDraft, DirectorSegmentPlan } from "./llm-prompt-chain-types";
import { formatPromptChainRange } from "./llm-prompt-chain-number-words";
import { renderRussianSpeechGenderRule } from "./russian-speech-gender-contract";
import { isVoiceoverMontageReference, resolveReferenceFormatMode } from "./omni-reference-format-mode";
import { resolveReferenceSceneMode } from "./omni-reference-scene-mode";
import { renderVisibleSubjectPolicy, resolveDirectorVisibleSubjectPolicy } from "./director-visibility-policy";
import { renderDirectorTimelineForPrompt, resolveDirectorSegmentFormat } from "./director-analysis-timeline";
import { requiresContinuousPresenterWardrobe } from "./director-wardrobe";
import { resolveReferenceTransferMode } from "./omni-reference-transfer-policy";
import type { ScriptAdaptationPlan } from "./script-adaptation-contract";
import type { ScriptContentContract } from "./script-content-contract";
import { buildReferenceMeaningGuidance } from "./reference-meaning-contract";

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
  adaptationPlan: ScriptAdaptationPlan;
  contentContract?: ScriptContentContract;
};

export function buildCreativeCopywriterPrompt(input: PromptChainInput) {
  const referenceMeaningGuidance = buildReferenceMeaningGuidance(input.sourceScenario.script);
  const durationInstruction = buildDurationLine(input.durationRange);
  return `
Ты креативный сценарист коротких вертикальных видео.

Задача: написать только живой русский voiceover сценарий для ролика. Это текст, который произносит аватар или диктор; визуально ролик может быть talking head, B-roll или их сочетанием.
Не возвращай JSON. Не добавляй заголовки, пояснения, markdown или варианты.

Сначала сам разберись в reference и продукте, но не показывай этот разбор пользователю:
1. Определи тему, главный вопрос или конфликт, обещание хука, ответ или механизм, примеры и финальный вывод reference.
2. Определи, что делает хук сильным: формулировка, личное признание, контраст, обещание, список, вопрос или неожиданный факт. Сохрани эту механику, если она применима.
3. Найди точку, где реальная потребность из reference естественно соединяется с нашим продуктом.
4. Напиши новый сценарий: не копируй текст дословно, но сохрани силу подачи, последовательность раскрытия и полезность исходной мысли.

${referenceMeaningGuidance}

Правила смысловой адаптации:
- Если продукт решает ту же проблему, сохрани тему, хук, логику, ключевые факты и примеры, заменив только несовместимые элементы.
- Если продукт решает соседнюю потребность, сначала дай зрителю ответ или пользу reference, затем сделай короткий причинный переход к продукту в той же ситуации.
- Если исходная тема не подходит напрямую, перенеси форму хука, личную подачу, темп и структуру на новую честную продуктовую историю. Не притворяйся, что продукт решает чужую проблему.
- Не отбрасывай сценарий только из-за несовпадения предметов. Сначала ищи честную потребность, выбор, проблему или переносимую форму подачи.
- Если reference обещает список, количество советов или конкретный ответ, сохрани это по смыслу, когда оно относится к новой версии. Не заменяй обязательные пункты названием продукта или CTA.
- Если продукт невозможно встроить в исходный факт, замени факт, а не вставляй случайную рекламу рядом с ним.
- Для подтверждения основной мысли достаточно одного конкретного факта или примера из reference. Второй добавляй только когда без него теряется причинная связь или обещанное хуком количество пунктов.

Сохрани разговорность, темп и конкретику. Пиши как человек записывает короткое видео другу, без канцелярита.
Сначала сохрани форму хука reference: утверждение остаётся утверждением, список остаётся списком, вопрос остаётся вопросом. Не превращай любой reference в шаблонный вопрос или универсальный кликбейт.
Первая часть сценария должна сохранять силу и механику хука reference, но не обязана дословно повторять его предмет.
Сначала раскрой обещание или вопрос хука и дай зрителю конкретный ответ. Упоминание продукта и CTA не считаются ответом на хук.
${buildProductTimingContract()}
Используй короткие, грамматически законченные предложения. Вопросительный и восклицательный знаки ставь только там, где они естественно задают интонацию.

Фокус сценария на нашем продукте:
В произносимом voiceover обязательно назови продукт точным названием «${input.productName}» минимум один раз и объясни его конкретную пользу. Фраза «ссылка в профиле», «ссылка в описании» или другой CTA никогда не заменяет название продукта.
Конкретную пользу возьми дословно по смыслу из описания продукта: назови действие, которое зритель сможет выполнить. Общие обещания «без проблем», «проще», «удобнее» и «без ограничений» без такого действия не считаются пользой.
Не называй продукт в хуке, если reference не требует этого. Введи продукт через конкретную потребность, выбор или проблему, которую уже создал текущий сюжет. Перед продуктом добавь короткий причинный мостик, после него объясни подтвержденную пользу именно для этой ситуации и продолжи основную мысль. Продукт не является отдельной рекламной вставкой и может появиться в любой естественной точке.
Если хук reference обещает конкретный факт, место, способ или результат, дай зрителю новый подтвержденный ответ в рамках адаптированной темы. Не обещай продуктом то, чего нет в его описании.
Называй только подтвержденное действие и пользу из описания продукта и заметок. Не добавляй свойства, гарантии, страны, цены, скидки или результаты, которых нет во входных данных.
CTA произнеси после объяснения пользы продукта. После CTA закончи одной короткой полезной фразой, а не новым призывом.
Финальная фраза после CTA должна быть утвердительным смысловым выводом, а не вопросом, приказом или новым призывом. «Забудь», «наслаждайся», «путешествуй», «попробуй» и «хочешь так же» не считаются выводом.
Финальный вывод должен завершать новую продуктовую мысль, а не оставлять хук без ответа и не возвращать зрителя к неподходящему исходному предмету.
Если нужно сократить текст, убирай повторы и вводные слова, а не название продукта, его пользу или CTA.
Если в reference уже есть чужой продукт, не копируй его название, бренд, упаковку и свойства. Сохрани его сценарную роль: предмет в списке, пример, демонстрация, доказательство или главный объект, и замени эту роль нашим продуктом.
Если автор reference говорит, что он врач, косметолог, нутрициолог, эксперт, специалист или другой профессионал, не переноси эту роль на аватара. Убери такую фразу или замени ее на нейтральную бытовую подачу от первого лица.
После первого упоминания продукта CTA должен завершать мысль о его применении, а не прерывать её. Не вставляй отдельный рекламный блок между двумя несвязанными полезными фразами.
Не выдумывай ссылки, артикулы, скидки или факты, которых нет во входных данных.
${renderRussianSpeechGenderRule(input.avatarSpeechGender)}
${durationInstruction}
Не делай больше пяти частей. Если reference длиннее, сокращай только повторы и вводные слова. Не удаляй хук, ответ на хук, конкретный механизм, обязательный пункт списка, доказательство, пользу продукта, CTA или финальный вывод.
CTA: ${buildCtaLine(input.ctaMode, input.ctaValue)}

Бренд: ${input.projectName}
Целевая аудитория: ${input.targetAudience || "не указана"}
Tone of voice: ${input.brandVoice || "живой, простой, уверенный"}

Продукт: ${input.productName}
Описание продукта: ${input.productDescription || "не указано"}
Заметки по продукту: ${input.productReferenceNotes || "не указаны"}

Reference transcript:
${input.sourceScenario.script}

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
  const hasDetailedTimeline = resolveReferenceTransferMode(input.chainInput.directorBrief) === "full_reference";
  const presenterReference = resolveDirectorSegmentFormat(input.chainInput.directorBrief) === "talking_head_cutaways";
  const segmentFormat = presenterReference ? "talking_head_cutaways" : "voiceover_broll";
  const frameRoleRule = hasDetailedTimeline
    ? "Для каждого storyboard_frame соблюдай соответствующий interval из SOURCE SHOT TIMELINE. source_role, subject, speech_mode и avatar_allowed — жесткие ограничения, а не подсказки: face_open и face_return разрешены только в interval с subject=primary_presenter и avatar_allowed=true; если interval является on_camera presenter-кадром, не заменяй его на environment_cutaway; в interval с avatar_allowed=false или subject=no_people не добавляй лицо, голову или говорящего аватара. Product_cutaway или environment_cutaway допустимы только там, где это явно допускает соответствующий source interval или REFERENCE SHOT CONTRACT. Не переноси правила первого и последнего кадра на весь ролик."
    : presenterReference
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
  const formatRule = hasDetailedTimeline
    ? "Сохрани SOURCE SHOT TIMELINE как жесткий визуальный контракт: последовательность ролей, наличие человека, speech_mode, avatar_allowed, локацию, крупность, композицию, реквизит, характер B-roll, камеру и переходы. Адаптируй только spoken meaning, исходную личность, несовместимую с аватаром одежду и identity продукта. Не меняй наблюдаемую локацию, камеру, композицию, реквизит или распределение presenter/B-roll под влиянием готового voiceover; product replacement допустим только в явно разрешенном source interval."
    : montageReference
    ? "Сохрани только макроформат montage и примерный темп смены планов. Сцены, действия, локации и порядок перебивок поставь заново под смысл текущего сценария."
      : presenterReference
      ? "Сохрани макроформат говорящей головы, но самостоятельно поставь сцену, жесты и короткие перебивки под новый сценарий."
      : `${renderVisibleSubjectPolicy(visibleSubjectPolicy)} Используй только общий визуальный язык reference и самостоятельно поставь сцены под новый сценарий.`;
  const sourceVisualPriorityRule = hasDetailedTimeline
    ? "ВИЗУАЛЬНЫЙ ПРИОРИТЕТ: verified SOURCE SHOT TIMELINE и REFERENCE SHOT CONTRACT имеют приоритет над готовым voiceover, упоминаниями предметов и любыми творческими догадками. Если смысл реплики конфликтует с наблюдаемой сценой, оставь сцену из reference и передай новый смысл голосом, мимикой или разрешенной продуктовой заменой. Упоминание taxi, Uber, машины или поездки не является командой показать автомобиль."
    : "Готовый voiceover определяет только смысл и нарратив. Не извлекай из него визуальные факты о локации, транспорте, реквизите, камере или B-roll; при наличии source timeline следуй ему, а без него используй только общий визуальный язык reference.";
  const firstSegmentRule = hasDetailedTimeline
    ? "Первый segment сохраняет силу и макроформат хука reference и визуальную сцену соответствующего source interval; не создавай новую локацию или отдельный B-roll только ради текущего текста."
    : "Первый segment сохраняет силу и макроформат хука reference, но получает новую режиссерскую сцену под текущий текст.";
  const cutawayRule = hasDetailedTimeline
    ? "Если source interval или REFERENCE SHOT CONTRACT разрешает cutaway, опиши его конкретным наблюдаемым действием. Не создавай cutaway только потому, что spoken_words называют taxi, Uber, машину, поездку или другой предмет."
    : "Cutaway должен содержать конкретное наблюдаемое действие, но взгляд персонажа и точная подача не являются обязательным совпадением с reference.";
  return `
Ты режиссер монтажа для Gemini Omni.

Возьми готовый сценарий и поставь его как Omni storyboard для формата ${segmentFormat}.
Верни только валидный JSON без markdown.

  Правила режиссуры:
  ${STORYBOARD_FRAME_ROLE_CONTRACT}
  Смысловая адаптация уже выполнена сценаристом в готовом voiceover. Не переписывай voiceover и не добавляй новый продуктовый тезис на этапе режиссуры; расставь этот текст по наблюдаемой визуальной механике reference.
  ${sourceVisualPriorityRule}
  Каждый segment строится storyboard first и может длиться четыре, шесть, восемь или десять секунд.
Границы segments, duration_seconds и voiceover уже утверждены ниже. Копируй их дословно и не добавляй, не удаляй, не переставляй и не перефразируй слова.
total_voiceover должен дословно совпадать с готовым сценарием.
Количество storyboard frames зависит от duration_seconds: четыре секунды это два кадра, шесть секунд это три кадра, восемь секунд это четыре кадра, десять секунд это пять кадров.
Каждый frame обычно содержит четыре слова финальной русской речи в spoken_words. Если во всем сценарии остается одно или два слова сверх блоков по четыре, добавь их только в последние кадры последнего segment: там допустимо пять слов в одном или двух кадрах.
Склейка spoken_words всех frames должна дословно совпадать с voiceover segment.
  ${frameRoleRule} Product_cutaway или environment_cutaway добавляй только там, где это разрешено соответствующим source interval или REFERENCE SHOT CONTRACT и где перебивка помогает смыслу spoken_words. Слова voiceover сами по себе не разрешают новую перебивку, локацию или транспорт. Границы source interval не должны разрывать spoken_words: если короткий interval попадает внутрь незавершённой фразы или на остаток звука, объедини его с соседним interval и не создавай отдельный micro-cut.
${hasDetailedTimeline ? renderDirectorTimelineForPrompt(input.chainInput.directorBrief) : "SOURCE SHOT TIMELINE: no verified detailed interval analysis is available."}
${subjectRule}
  ${firstSegmentRule} Продукт остается вне кадра, пока текущая реплика не создает конкретную потребность показать его применение или результат выбора. Это правило определяет начало product-demo beat, а не отдельный случайный кадр: после первого видимого кадра продукт остается видимым в каждом следующем кадре непрерывного demo-run, пока не показано явное действие положить, передать или убрать продукт.
В итоговом voiceover каждого плана обязательно должно прозвучать точное название «${input.chainInput.productName}» и конкретная польза продукта. Фраза «ссылка в профиле», «ссылка в описании» или другой CTA не считается упоминанием продукта.
${buildProductTimingContract()}
${cutawayRule}
${presenterReference ? "В talking head кадрах главным героем остается сохраненный аватар; позу, взгляд и жест выбирай под текущую реплику." : renderVisibleSubjectPolicy(visibleSubjectPolicy)}
В каждом frame опиши visual_description, camera, action, product_state, sfx и reference_role. Visual_description должен быть конкретной видимой сценой, которая прямо раскрывает смысл spoken_words этого frame, а не универсальной демонстрацией продукта.
SFX это только естественные звуки кадра. Музыку для Omni не планируй: без фоновой музыки, джинглов и музыкальных эффектов.
Слова spoken_words — это только тайминг и смысловая привязка кадра. Не печатай их на storyboard image: изображение должно оставаться без текста. В финальный промт Omni передай полный voiceover segment ровно один раз.
В spoken_words не добавляй лишние слова: используй точную реплику кадра, обычно четыре слова; пять слов допустимы только в одном или двух последних кадрах последнего segment при остатке один или два слова.
Каждый frame описывает только физическую сцену, камеру, действие и естественный звук внутри кадра.
Выбирай product_cutaway и удерживание продукта в руках только когда смысл spoken_words этого кадра прямо связан с продуктом, его свойствами или применением. Если фраза посвящена общей теме, проблеме или выводу без прямого контакта с продуктом, продукт должен быть вне кадра (product_state: "вне кадра"), а персонаж говорит с естественной жестикуляцией без товара в руках. В product_cutaway продукт обязан быть физически видимым и детально совпадать с product reference.
${hasDetailedTimeline ? "Для непредметных кадров используй физическую сцену соответствующего source interval и не создавай новую локацию или новый транспорт. Она должна наглядно раскрывать текущую реплику через речь, жест или разрешенную продуктовую замену. Из reference не переноси чужой продукт." : "Для непредметных кадров создавай самостоятельную сцену, которая наглядно раскрывает текущую реплику. Из reference бери только общий визуальный язык без чужого продукта."}
${formatRule} ${wardrobeRule}
  ${hasDetailedTimeline ? "Камеру, переходы и совместимые тайминги бери из SOURCE SHOT TIMELINE и REFERENCE SHOT CONTRACT; не меняй их под влиянием отдельных слов voiceover. Речевые границы storyboard имеют приоритет над коротким source interval: несовместимый микрокат объединяй с соседним безопасным beat-ом. Сохраняй визуальную механику и распределение человека/B-roll." : "Камеру, переходы и точные тайминги выбирай сам под ясность текущего сценария. Из reference сохрани только примерную энергетику, крупность и общий тип монтажа."}
Мысль может естественно продолжаться между соседними segments. Не добавляй слова ради искусственного завершения фразы.
${renderRussianSpeechGenderRule(input.chainInput.avatarSpeechGender)}
  В segment без продуктовой демонстрации продукт остается вне кадра. В segment с демонстрацией опиши одну непрерывную физическую последовательность внутри contiguous demo-run: первый видимый кадр — явный reveal или продукт уже устойчиво находится на поверхности; затем рука подходит, касается, берет, после чего тот же продукт остается в руке. Не создавай скрытый кадр после reveal и не начинай demo-run с состояния «уже держит», если предыдущий кадр был без продукта.
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
          "spoken_words": "ровно четыре слова в кадре",
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
    STORYBOARD_FRAME_ROLE_CONTRACT,
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

const STORYBOARD_FRAME_ROLE_CONTRACT = [
  "STORYBOARD FRAME ROLE CONTRACT: source_role и storyboard_frames[].role — разные поля.",
  "source_role описывает функцию кадра в исходном видео и может быть hook, presenter, environment_broll, product_broll, proof_broll, transition, ending или unknown.",
  "storyboard_frames[].role описывает только визуальный тип нового кадра. Разрешены ровно face_open, product_cutaway, environment_cutaway и face_return.",
  "Никогда не копируй значения source_role в storyboard_frames[].role: hook — это функция хука, обычно первых одной-двух секунд, а не тип визуального кадра.",
  "Для hook выбери визуальный тип по содержанию: лицо — face_open, продукт — product_cutaway, окружение — environment_cutaway.",
].join(" ");

function buildDurationLine(durationRange?: OmniDurationRange) {
  if (!durationRange) return "Итоговый сценарий обычно должен быть плотным и коротким. Держи примерно четыре слова на двухсекундный кадр; остаток в одно или два слова допустим только в последних кадрах последнего segment.";
  const secondsRange = formatPromptChainRange(durationRange.minSeconds, durationRange.maxSeconds);
  const wordsRange = formatPromptChainRange(durationRange.minWords, durationRange.maxWords);
  return [
    `Цель по ролику: ${secondsRange} секунд.`,
    `Текст: ${wordsRange} слов.`,
    "Стремись к этой длине, но не урезай смысл ради верхней границы: если текст естественно длиннее, сохрани его до общего лимита 100 слов, а раскадровка добавит часть. Используй блоки по четыре слова, допускай остаток одно или два слова только в последних кадрах последней части и не создавай больше пяти частей.",
  ].join(" ");
}

function buildCtaLine(mode: CtaMode, value: string | null) {
  if (mode === "keyword_in_comments") return `до финального вывода попросить написать кодовое слово «${value || "кодовое слово"}» в комментариях, затем закончить отдельной полезной утвердительной фразой`;
  if (mode === "link_in_profile") return `в момент естественного завершения мысли о продукте произнеси точную фразу «ссылка в профиле»${value ? `, цель ссылки: ${value}` : ""}; после CTA продолжи полезную мысль и закончи выводом, чтобы финальная часть ролика не состояла только из призыва; не упоминай описание, комментарии или кодовые слова`;
  if (mode === "no_explicit_cta") return "без явного CTA, закончить личным выводом";
  return "нативно связать мысль о продукте с тем, что артикул или подробности можно найти в описании. Размести CTA там, где естественно завершается рассказ о продукте, затем закончи отдельным полезным выводом. Не используй сухие шаблоны; в описании упоминается только артикул, без ссылок и лишней информации.";
}

function buildProductTimingContract(): string {
  return "Единый контракт интеграции продукта: найди в reference конкретную ситуацию, потребность, выбор или проблему, где продукт уместен как инструмент, пример или решение. Перед упоминанием сформулируй короткий причинный мостик от текущей мысли к этой потребности; затем назови продукт и покажи только подтвержденную пользу именно для нее. Упоминание может быть в любой естественной точке, не обязательно в середине. Если предложение о продукте можно удалить без потери логики, перепиши его. В director storyboard показывай продукт только в кадрах этой причинной интеграции, без отдельного рекламного блока.";
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
