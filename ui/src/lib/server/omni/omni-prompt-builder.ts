import type { OmniClientAvatar, OmniGeneratedScript, OmniProduct, OmniReferenceAsset } from "@/lib/omni/types";
import { buildReelVisualWorld, pickVisualIdea, VisualWorld } from "./omni-ugc-contract";

export type OmniSegmentPrompt = {
  index: number;
  role: string;
  prompt: string;
  referenceUrl: string | null;
  voiceoverText: string;
};

type BuildOmniPromptsInput = {
  generatedScript: OmniGeneratedScript | null;
  legacyTranscript: string | null;
  product: OmniProduct;
  avatar: OmniClientAvatar | null;
  segmentCount: number;
  segmentSeconds: number;
  brief: string | null;
};

export const OMNI_PROMPT_WRITER_SYSTEM_PROMPT = "Сделай живой короткий Reels-ролик. Описывай только то, что видно и слышно в кадре.";

type PromptPartInput = {
  segmentIndex: number;
  segmentCount: number;
  segmentSeconds: number;
  role: string;
  scriptChunk: string;
  fullScript: string;
  brief: string | null;
  product: OmniProduct;
  productReference: OmniReferenceAsset | null;
  avatar: OmniClientAvatar | null;
  avatarReference: string | null;
  visualWorld: VisualWorld;
};

export function buildOmniSegmentPrompts(input: BuildOmniPromptsInput): OmniSegmentPrompt[] {
  const scriptText = input.generatedScript?.script || input.legacyTranscript || input.brief || "";
  const chunks = splitScriptIntoChunks(scriptText, input.segmentCount);
  const productReference = getPrimaryReference(input.product.product_refs);
  const avatarReference = input.avatar?.reference_url || null;
  const visualWorld = buildReelVisualWorld(scriptText || input.brief || "", input.product);

  return Array.from({ length: input.segmentCount }, (_, index) => {
    const segmentIndex = index + 1;
    const role = getSegmentRole(segmentIndex, input.segmentCount);
    const scriptChunk = chunks[index] || "";
    const referenceUrl = segmentIndex === 1 ? avatarReference : productReference?.url || avatarReference || null;

    return {
      index: segmentIndex,
      role,
      referenceUrl,
      voiceoverText: scriptChunk,
      prompt: buildSinglePrompt({
        segmentIndex,
        segmentCount: input.segmentCount,
        segmentSeconds: input.segmentSeconds,
        role,
        scriptChunk,
        fullScript: scriptText,
        brief: input.brief,
        product: input.product,
        productReference,
        avatar: input.avatar,
        avatarReference,
        visualWorld,
      }),
    };
  });
}

function buildSinglePrompt(input: PromptPartInput) {
  const baseSeed = `${input.fullScript} ${input.product.name} ${input.visualWorld.name}`;
  const sceneSeed = `${baseSeed} ${input.segmentIndex}`;
  const voiceover = input.scriptChunk || "Скажи одну короткую естественную фразу по смыслу этого момента.";
  const previousAngle = input.segmentIndex > 1 ? transitionAngle(input.visualWorld, baseSeed, input.segmentIndex - 1) : null;
  const nextAngle =
    input.segmentIndex < input.segmentCount ? transitionAngle(input.visualWorld, baseSeed, input.segmentIndex) : null;
  const timeline = buildTimeline(input, voiceover, previousAngle, nextAngle, sceneSeed);

  return [
    OMNI_PROMPT_WRITER_SYSTEM_PROMPT,
    "",
    `Часть ${input.segmentIndex} из ${input.segmentCount}.`,
    `Место: ${input.visualWorld.setting}.`,
    buildCharacterLine(input),
    "",
    "Сцена по секундам:",
    timeline,
    "",
    `Реплика в этой части: "${voiceover}"`,
    "",
    buildContinuityLine(input, previousAngle, nextAngle),
    buildProductLine(input),
    buildCtaLine(input),
    "Действия простые и физически понятные: один предмет в одной руке, смешивание или показ продукта идет по шагам, без одновременных невозможных движений.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildTimeline(
  input: PromptPartInput,
  voiceover: string,
  previousAngle: string | null,
  nextAngle: string | null,
  seed: string
) {
  if (input.segmentIndex === 1) {
    const hook = pickVisualIdea(input.visualWorld.hookIdeas, seed);
    return [
      `0-3 сек: ${hook}. Начало сразу цепляет внимание, без приветствия.`,
      `3-7 сек: герой остается в том же месте и говорит первую мысль: "${voiceover}".`,
      `7-${input.segmentSeconds} сек: перейти в ракурс для следующей части: ${nextAngle}. Закончить ровно этим кадром.`,
    ].join("\n");
  }

  if (input.segmentIndex === input.segmentCount) {
    const beat = pickVisualIdea(input.visualWorld.finalBeats, seed, input.segmentIndex);
    return [
      `0-2 сек: начать в том же ракурсе, которым закончилась предыдущая часть: ${previousAngle}.`,
      `2-7 сек: ${beat}. Герой говорит: "${voiceover}".`,
      `7-${input.segmentSeconds} сек: спокойный финальный кадр в том же месте, без резкой смены фона.`,
    ].join("\n");
  }

  const beat = pickVisualIdea(input.visualWorld.middleBeats, seed, input.segmentIndex);
  return [
    `0-2 сек: начать в том же ракурсе, которым закончилась предыдущая часть: ${previousAngle}.`,
    `2-7 сек: ${beat}. Герой говорит: "${voiceover}".`,
    `7-${input.segmentSeconds} сек: перейти в ракурс для следующей части: ${nextAngle}. Закончить ровно этим кадром.`,
  ].join("\n");
}

function buildCharacterLine(input: PromptPartInput) {
  if (!input.avatarReference && !input.avatar?.prompt) return "Герой выглядит как обычный живой человек, не рекламная модель.";
  return "Герой сохраняет один и тот же внешний тип, возраст, настроение и одежду во всех частях ролика.";
}

function buildProductLine(input: PromptPartInput) {
  if (!input.productReference) return "";
  if (input.segmentIndex === 1) {
    return "В первой части продукт не показывать: только подготовить интерес к тому, что появится дальше.";
  }
  if (input.segmentIndex === input.segmentCount) {
    return "В финальной части продукт виден естественно в кадре, как часть обычной рутины.";
  }
  return "В этой части впервые естественно показать продукт в кадре и не превращать сцену в рекламу.";
}

function buildCtaLine(input: PromptPartInput) {
  if (input.segmentIndex !== input.segmentCount) return "";
  return [
    "CTA в финале звучит бытово и под Reels-аудиторию: без продажного тона, как личная подсказка подруге.",
    "Скажи разными живыми словами, что артикул или код можно найти в описании: например «артикул оставлю в описании», «код будет в описании», «кому надо — гляньте артикул под видео».",
    "Если в тексте сценария уже есть конкретный артикул или код, произнеси именно его естественно; если нет, не выдумывай номер.",
  ].join("\n");
}

function buildContinuityLine(input: PromptPartInput, previousAngle: string | null, nextAngle: string | null) {
  if (input.segmentCount <= 1) return "Весь ролик выглядит как одна цельная сцена.";
  if (previousAngle && nextAngle) {
    return `Склейка: начать с ракурса "${previousAngle}", закончить ракурсом "${nextAngle}". Следующая часть должна начаться с него же.`;
  }
  if (nextAngle) {
    return `Склейка: закончить ракурсом "${nextAngle}". Следующая часть должна начаться с него же.`;
  }
  if (previousAngle) {
    return `Склейка: начать с того же ракурса, которым закончилась предыдущая часть: "${previousAngle}".`;
  }
  return "";
}

function transitionAngle(visualWorld: VisualWorld, seed: string, boundaryIndex: number) {
  return pickVisualIdea(visualWorld.transitionAngles, seed, boundaryIndex);
}

function splitScriptIntoChunks(script: string, count: number) {
  const normalized = script.replace(/\s+/g, " ").trim();
  const totalWords = countWords(normalized);
  const targetWords = Math.max(8, Math.ceil(totalWords / count));
  const sentenceUnits = normalized.match(/[^.!?]+[.!?]*/g)?.map((part) => part.trim()).filter(Boolean) || [];
  const units = sentenceUnits.length >= count ? sentenceUnits : splitWordsIntoUnits(normalized, targetWords);
  if (!units.length) return [];

  const chunks = Array.from({ length: count }, () => [] as string[]);
  let chunkIndex = 0;
  let chunkWords = 0;

  for (const unit of units) {
    const unitWords = countWords(unit);
    const hasRoom = chunkWords === 0 || chunkWords + unitWords <= targetWords || chunkIndex === count - 1;
    if (!hasRoom) {
      chunkIndex = Math.min(chunkIndex + 1, count - 1);
      chunkWords = 0;
    }
    chunks[chunkIndex].push(unit);
    chunkWords += unitWords;
  }

  return chunks.map((chunk) => chunk.join(" ").trim()).filter(Boolean);
}

function countWords(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

function splitWordsIntoUnits(text: string, targetWords: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const units: string[] = [];
  for (let index = 0; index < words.length; index += targetWords) {
    units.push(words.slice(index, index + targetWords).join(" "));
  }
  return units;
}

function getPrimaryReference(refs: OmniReferenceAsset[]) {
  return refs.find((ref) => ref.is_primary && ref.kind === "image") || refs.find((ref) => ref.kind === "image") || null;
}

function getSegmentRole(index: number, total: number) {
  if (index === 1) return "hook";
  if (index === total) return "cta_or_payoff";
  return "body";
}
