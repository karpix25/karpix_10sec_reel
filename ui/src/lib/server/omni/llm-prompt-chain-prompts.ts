import type { CtaMode } from "@/lib/omni/creative-contract";
import type { OmniLegacyScenario } from "@/lib/omni/types";
import { normalizeOmniWardrobeSource, type OmniWardrobeSource } from "../../omni/wardrobe-source";
import type { DirectorBrief } from "./director-analysis-types";
import { renderDirectorBriefForScriptPrompt, renderDirectorBriefForOmniPrompt } from "./director-analysis-prompt";
import type { OmniDurationRange } from "./omni-duration-range";
import type { CreativeScriptDraft, DirectorSegmentPlan } from "./llm-prompt-chain-types";
import { formatPromptChainRange } from "./llm-prompt-chain-number-words";

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
};

export function buildCreativeCopywriterPrompt(input: PromptChainInput) {
  return `
Ты креативный сценарист коротких вертикальных видео.

Задача: написать только живой русский voiceover сценарий для говорящего человека.
Не возвращай JSON. Не добавляй заголовки, пояснения, markdown или варианты.

Критерии:
Пиши как человек записывает короткое видео другу, без канцелярита.
Начни с сильного хука через боль, контраст, парадокс или личное наблюдение.
Сохрани разговорность, темп и конкретику.
Не копируй исходный ролик дословно, используй его только как пример структуры.
Не выдумывай ссылки, артикулы, скидки или факты, которых нет во входных данных.
${buildDurationLine(input.durationRange)}
CTA: ${buildCtaLine(input.ctaMode, input.ctaValue)}

Бренд: ${input.projectName}
Целевая аудитория: ${input.targetAudience || "не указана"}
Tone of voice: ${input.brandVoice || "живой, простой, уверенный"}

Продукт: ${input.productName}
Описание продукта: ${input.productDescription || "не указано"}
Заметки по продукту: ${input.productReferenceNotes || "не указаны"}

Reference transcript:
${input.sourceScenario.script}

${renderDirectorBriefForScriptPrompt(input.directorBrief || null)}
`.trim();
}

export function buildDirectorSegmenterPrompt(input: {
  chainInput: PromptChainInput;
  draft: CreativeScriptDraft;
}) {
  return `
Ты режиссер монтажа для Gemini Omni.

Возьми готовый сценарий и раздели его на десятисекундные Omni segments для формата talking_head_cutaways.
Верни только валидный JSON без markdown.

Правила режиссуры:
Каждый segment строится storyboard first: ровно пять storyboard frames на segment.
Каждый frame содержит ровно три или четыре слова финальной русской речи в spoken_words.
Склейка spoken_words всех пяти frames должна дословно совпадать с voiceover segment.
Первый frame всегда face_open. В середине должны быть product_cutaway или environment_cutaway. Последний frame всегда face_return.
Cutaway frames не могут показывать персонажа, который смотрит в камеру.
В каждом frame опиши visual_description, camera, action, product_state, sfx и reference_role.
SFX это только естественные звуки кадра. Музыку для Omni не планируй: без фоновой музыки, джинглов и музыкальных эффектов.
Не разрывай мысль на стыке сегментов. Voiceover сегмента должен заканчиваться законченной фразой.
Запрещено заканчивать segment словами вроде вы сможете, сможете, можно, помогает, позволяет, для, и.
В одном segment продукт должен иметь один физический статус: или на столе, или в руках, или вне кадра.
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

Верни JSON:
{
  "title": "короткий заголовок",
  "hook_options": ["вариант хука словами", "вариант хука словами", "вариант хука словами"],
  "selected_hook": "выбранный хук",
  "total_voiceover": "полный сценарий из voiceover сегментов",
  "segments": [
    {
      "index": 1,
      "duration_seconds": 10,
      "voiceover": "точная речь сегмента",
      "product_state": "единое физическое состояние продукта в этом сегменте",
      "storyboard_frames": [
        {
          "index": 1,
          "role": "face_open",
          "spoken_words": "три или четыре слова",
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
Каждый provider segment обязан нести storyboard_frames из пяти кадров.
Склейка spoken_words всех пяти storyboard_frames должна дословно совпадать с voiceover.
Каждый frame должен сохранить три или четыре слова финальной русской речи, детальный визуал, camera, action, product_state, sfx и reference_role.
Provider prompt должен описывать storyboard как пять последовательных кадров примерно по две секунды.
Omni должен сгенерировать русскую речь и естественные SFX. Omni не должен генерировать музыку, фоновые треки, джинглы или музыкальные эффекты.
Наша фоновая музыка добавляется после из библиотеки, поэтому в prompt пиши только no music и natural SFX.
Character_id аватара передается отдельно. Product reference передается отдельно. Не вставляй ссылки или идентификаторы в prompt.
В финальном prompt вообще не упоминай субтитры, оверлеи, интерфейсы, текст на экране или названия платформ, даже в отрицании.
${wardrobeRule}
Все числа в текстовых значениях JSON пиши словами. Не используй emoji, дефисы, тире или минусы.
Если продукт на столе, не пиши что персонаж держит его в руках.
Если перебивка без рук, не пиши что рука двигает или берет продукт.
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
      "duration_seconds": 10,
      "voiceover": "точная речь сегмента",
      "storyboard_frames": [
        {
          "index": 1,
          "role": "face_open",
          "spoken_words": "три или четыре слова",
          "visual_description": "детальное описание кадра",
          "camera": "крупность и движение камеры",
          "action": "конкретное действие",
          "product_state": "физическое состояние продукта",
          "sfx": "естественный бытовой звук",
          "reference_role": "avatar"
        }
      ],
      "reference_role": "avatar",
      "prompt": "полный цельный prompt для Gemini Omni со storyboard из пяти кадров, точной речью, natural SFX и no music"
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
    "Не делай сценарий короче нижней границы.",
  ].join(" ");
}

function buildCtaLine(mode: CtaMode, value: string | null) {
  if (mode === "keyword_in_comments") return `попроси написать кодовое слово «${value}» в комментариях`;
  if (mode === "link_in_profile") return `мягко направь к ссылке в профиле${value ? `, цель ссылки: ${value}` : ""}`;
  if (mode === "no_explicit_cta") return "без явного CTA, закончить личным выводом";
  return "мягко сказать, что артикул или код можно найти в описании, если эти данные есть";
}
