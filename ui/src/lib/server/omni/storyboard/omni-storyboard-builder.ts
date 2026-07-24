import type { OmniPromptValidationResult, OmniSegmentCreativePlan } from "@/lib/omni/creative-contract";
import {
  FIVE_FRAMES_PER_TEN_SECONDS,
  OMNI_STORYBOARD_MAX_FRAME_WORDS,
  OMNI_STORYBOARD_MIN_FRAME_WORDS,
  type OmniStoryboardFrame,
  type OmniStoryboardSegment,
  type OmniStoryboardValidationResult,
} from "@/lib/omni/storyboard/omni-storyboard-types";
import { validateOmniStoryboardSegment } from "@/lib/omni/storyboard/omni-storyboard-contract";
import type { OmniCharacterContract } from "../omni-character-contract";
import type { StoryboardFrame } from "../llm-prompt-chain-types";

export function buildStoryboardFromCreativePlan(input: {
  plan: OmniSegmentCreativePlan;
  productName: string;
  productVisualPassport?: string | null;
  characterContract: OmniCharacterContract;
  segmentIndex: number;
}): OmniStoryboardSegment {
  const words = splitWords(input.plan.voiceoverText);
  const minWords = FIVE_FRAMES_PER_TEN_SECONDS * OMNI_STORYBOARD_MIN_FRAME_WORDS;
  const maxWords = FIVE_FRAMES_PER_TEN_SECONDS * OMNI_STORYBOARD_MAX_FRAME_WORDS;
  if (words.length < minWords || words.length > maxWords) {
    throw new Error(`Storyboard segment ${input.segmentIndex} needs ${minWords}-${maxWords} words, got ${words.length}`);
  }

  const chunks = splitIntoFrameSpeech(words);
  return {
    segmentIndex: input.segmentIndex,
    durationSeconds: 10,
    voiceoverText: input.plan.voiceoverText,
    frames: chunks.map((spokenText, index) =>
      buildFrame({
        plan: input.plan,
        productName: input.productName,
        productVisualPassport: input.productVisualPassport,
        characterContract: input.characterContract,
        spokenText,
        frameIndex: index + 1,
      })
    ),
  };
}

export function buildStoryboardFromPromptChainFrames(input: {
  segmentIndex: number;
  durationSeconds: number;
  voiceoverText: string;
  frames: readonly StoryboardFrame[];
}): OmniStoryboardSegment {
  if (!input.frames.length) throw new Error(`Storyboard segment ${input.segmentIndex} has no frames`);
  return {
    segmentIndex: input.segmentIndex,
    durationSeconds: input.durationSeconds,
    voiceoverText: input.voiceoverText,
    frames: input.frames.map((frame) => ({
      spokenText: frame.spokenWords,
      visualAction: frame.visualDescription || frame.action,
      camera: frame.camera,
      environment: "окружение и свет из режиссерского плана и storyboard image",
      wardrobe: "одежда из avatar или reference contract, без смены между кадрами",
      productPlacement: frame.productState || "продукт следует физическому состоянию storyboard",
      sfxNotes: frame.sfx || "естественные звуки сцены и речи",
      effectNotes: "можно использовать нарисованные субтитры, стрелки и эффекты как визуальные подсказки",
      modelMusicNotes: null,
    })),
  };
}

export function promptValidationFromStoryboard(
  validation: OmniStoryboardValidationResult
): OmniPromptValidationResult {
  return {
    valid: validation.valid,
    score: Math.max(0, 100 - validation.errors.length * 25 - validation.warnings.length * 6),
    errors: validation.errors,
    warnings: validation.warnings,
  };
}

export function validateBuiltStoryboard(storyboard: OmniStoryboardSegment) {
  return validateOmniStoryboardSegment(storyboard);
}

function buildFrame(input: {
  plan: OmniSegmentCreativePlan;
  productName: string;
  productVisualPassport?: string | null;
  characterContract: OmniCharacterContract;
  spokenText: string;
  frameIndex: number;
}): OmniStoryboardFrame {
  const startSeconds = (input.frameIndex - 1) * 2;
  const beat = input.plan.beats.find((item) => startSeconds >= item.startSeconds && startSeconds < item.endSeconds) ||
    input.plan.beats[0];

	  return {
	    spokenText: input.spokenText,
	    visualAction: renderFrameAction(beat?.action, input.frameIndex),
	    camera: input.frameIndex === 3 ? "короткая перебивка или средний план" : "живой фронтальный кадр на телефон",
	    environment: "то же окружение и свет, что заданы сценой сегмента",
    wardrobe: input.characterContract.clothingLine,
    productPlacement: renderProductPlacement(input.plan, input.productName, input.productVisualPassport),
    sfxNotes: input.frameIndex === 3 ? "естественный звук действия с продуктом" : "тихие естественные звуки комнаты и речи",
    effectNotes: "можно использовать нарисованные субтитры, стрелки и эффекты как визуальные подсказки",
    modelMusicNotes: null,
  };
}

function renderProductPlacement(
  plan: OmniSegmentCreativePlan,
  productName: string,
  productVisualPassport?: string | null
) {
  const productDetails = productVisualPassport ? `, детали из референса: ${compactProductReference(productVisualPassport)}` : "";
  if (plan.productRole === "hidden") return `${productName} вне кадра в этом сегменте`;
  if (plan.productRole === "brief_demo") return `${productName} в коротком физическом действии с рукой${productDetails}`;
  if (plan.productRole === "natural_use") return `${productName} используется как естественный предмет сцены${productDetails}`;
  return `${productName} виден как реальный предмет в окружении${productDetails}`;
}

function renderFrameAction(action: string | undefined, frameIndex: number) {
  const normalized = compactText(action || "персонаж естественно говорит в камеру", 220);
  const visualCue = extractVisualCue(normalized);
  if (visualCue) {
    return frameIndex === 3
      ? `короткая перебивка: ${visualCue}`
      : `персонаж говорит в камеру, визуальный ориентир: ${visualCue}`;
  }
  return compactText(normalized, 180);
}

function extractVisualCue(value: string) {
  const cue = value.match(/visual cue сценариста:\s*([^;.]+)/iu)?.[1] ||
    value.match(/Сценарный visual cue:\s*([^;.]+)/iu)?.[1] ||
    value.match(/Сценарный visual plan:\s*[^:]+:\s*([^|.]+)/iu)?.[1];
  return cue ? compactText(cue, 140) : "";
}

function compactText(value: string, maxLength: number) {
  const cleaned = value
    .replace(/PRODUCT VISUAL PASSPORT:/giu, "")
    .replace(/-\s*Must preserve:/giu, "")
    .replace(/\s+/gu, " ")
    .trim();
  if (cleaned.length <= maxLength) return cleaned;
  const clipped = cleaned.slice(0, maxLength).replace(/\s+\S*$/u, "").trim();
  return clipped || cleaned.slice(0, maxLength).trim();
}

function compactProductReference(value: string) {
  const lines = value.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const preferredLabels = ["Prompt summary", "Must preserve", "Physical form", "Exact visible colors", "Materials and finish"];
  const preferred = preferredLabels
    .map((label) => lines.find((line) => new RegExp(`^-\\s*${label}:`, "iu").test(line)) || "")
    .map((line) => line.replace(/^-\s*[^:]+:\s*/u, ""))
    .find(Boolean);
  return compactText(preferred || value, 160);
}

function splitIntoFrameSpeech(words: string[]) {
  const chunks: string[] = [];
  let cursor = 0;
  for (let index = 0; index < FIVE_FRAMES_PER_TEN_SECONDS; index += 1) {
    const remainingFrames = FIVE_FRAMES_PER_TEN_SECONDS - index;
    const remainingWords = words.length - cursor;
    const size = Math.min(
      OMNI_STORYBOARD_MAX_FRAME_WORDS,
      Math.max(OMNI_STORYBOARD_MIN_FRAME_WORDS, remainingWords - (remainingFrames - 1) * OMNI_STORYBOARD_MIN_FRAME_WORDS)
    );
    chunks.push(words.slice(cursor, cursor + size).join(" "));
    cursor += size;
  }
  return chunks;
}

function splitWords(text: string) {
  return text.trim().split(/\s+/u).filter(Boolean);
}
