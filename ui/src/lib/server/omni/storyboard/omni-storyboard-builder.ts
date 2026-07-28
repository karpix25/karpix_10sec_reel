import type { OmniPromptValidationResult, OmniSegmentCreativePlan } from "@/lib/omni/creative-contract";
import {
  OMNI_STORYBOARD_MAX_FRAME_WORDS,
  OMNI_STORYBOARD_MIN_FRAME_WORDS,
  getOmniStoryboardFrameCount,
  type OmniStoryboardFrame,
  type OmniStoryboardSegment,
  type OmniStoryboardValidationResult,
} from "@/lib/omni/storyboard/omni-storyboard-types";
import { validateOmniStoryboardSegment } from "@/lib/omni/storyboard/omni-storyboard-contract";
import type { OmniCharacterContract } from "../omni-character-contract";
import type { StoryboardFrame } from "../llm-prompt-chain-types";
import type { DirectorBrief } from "../director-analysis-types";
import { normalizeOmniWardrobeSource, type OmniWardrobeSource } from "../../../omni/wardrobe-source";

const CLEAN_STORYBOARD_STYLE = "чистая натуральная картинка без лишней декоративной графики, стрелок и рекламных надписей";

export function buildStoryboardFromCreativePlan(input: {
  plan: OmniSegmentCreativePlan;
  productName: string;
  productVisualPassport?: string | null;
  productPhysicalHint?: string | null;
  characterContract: OmniCharacterContract;
  segmentIndex: number;
  durationSeconds: number;
  directorBrief?: DirectorBrief | null;
  wardrobeSource?: OmniWardrobeSource;
}): OmniStoryboardSegment {
  const words = splitWords(input.plan.voiceoverText);
  const frameCount = getOmniStoryboardFrameCount(input.durationSeconds);
  if (!frameCount) throw new Error(`Storyboard segment ${input.segmentIndex} has unsupported duration ${input.durationSeconds}`);
  const minWords = frameCount * OMNI_STORYBOARD_MIN_FRAME_WORDS;
  const maxWords = frameCount * OMNI_STORYBOARD_MAX_FRAME_WORDS;
  if (words.length < minWords || words.length > maxWords) {
    throw new Error(`Storyboard segment ${input.segmentIndex} needs ${minWords}-${maxWords} words, got ${words.length}`);
  }

  const chunks = splitIntoFrameSpeech(words, frameCount);
  return {
    segmentIndex: input.segmentIndex,
    durationSeconds: input.durationSeconds,
    voiceoverText: input.plan.voiceoverText,
    frames: chunks.map((spokenText, index) =>
      buildFrame({
        plan: input.plan,
        productName: input.productName,
        productVisualPassport: input.productVisualPassport,
        productPhysicalHint: input.productPhysicalHint,
        characterContract: input.characterContract,
        directorBrief: input.directorBrief,
        wardrobeSource: input.wardrobeSource,
        spokenText,
        frameIndex: index + 1,
        frameCount,
      })
    ),
  };
}

export function buildStoryboardFromPromptChainFrames(input: {
  segmentIndex: number;
  durationSeconds: number;
  voiceoverText: string;
  frames: readonly StoryboardFrame[];
  productPhysicalHint?: string | null;
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
      productPlacement: renderPromptChainProductPlacement(frame.productState, input.productPhysicalHint),
      sfxNotes: frame.sfx || "естественные звуки сцены и речи",
      effectNotes: CLEAN_STORYBOARD_STYLE,
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
  productPhysicalHint?: string | null;
  characterContract: OmniCharacterContract;
  directorBrief?: DirectorBrief | null;
  wardrobeSource?: OmniWardrobeSource;
  spokenText: string;
  frameIndex: number;
  frameCount: number;
}): OmniStoryboardFrame {
  const startSeconds = (input.frameIndex - 1) * 2;
  const beat = input.plan.beats.find((item) => startSeconds >= item.startSeconds && startSeconds < item.endSeconds) ||
    input.plan.beats[0];
  const cutawayFrameIndex = Math.ceil(input.frameCount / 2);
  const isCutawayFrame = input.frameIndex === cutawayFrameIndex;

  return {
    spokenText: input.spokenText,
    visualAction: renderFrameAction(beat?.action, isCutawayFrame),
    camera: renderFrameCamera(input.frameIndex, input.frameCount, isCutawayFrame, renderDirectorCamera(input.directorBrief)),
    environment: renderDirectorEnvironment(input.directorBrief),
    wardrobe: renderStoryboardWardrobe(input.characterContract, input.directorBrief, input.wardrobeSource),
    productPlacement: renderProductPlacement(
      input.plan,
      input.productName,
      input.productVisualPassport,
      input.productPhysicalHint
    ),
    sfxNotes: isCutawayFrame ? "естественный звук короткого действия с продуктом" : "тихие естественные звуки комнаты и живой речи",
    effectNotes: renderFrameEffect(input.frameIndex, input.frameCount, isCutawayFrame),
    modelMusicNotes: null,
  };
}

function renderFrameCamera(
  frameIndex: number,
  frameCount: number,
  isCutawayFrame: boolean,
  directorCamera: string
) {
  const base = isCutawayFrame
    ? "быстрая перебивка крупнее обычного: продукт, рука или деталь среды в движении"
    : frameIndex === 1
      ? "триггерный кадр с живым движением камеры, герой смотрит прямо в объектив"
      : frameIndex === frameCount
        ? "возврат к лицу, камера чуть приближается для финальной фразы, герой смотрит прямо в объектив"
        : frameIndex % 2 === 0
          ? "средний план под углом, герой делает жест рукой и смотрит прямо в объектив"
          : "полукрупный план с легким handheld движением, герой смотрит прямо в объектив";
  return directorCamera ? `${base}; ${directorCamera}` : base;
}

function renderDirectorEnvironment(brief?: DirectorBrief | null) {
  const timeline = brief?.location_timeline?.[0];
  const parts = [
    timeline?.setting || brief?.atmosphere.setting,
    timeline?.environment,
    timeline?.lighting || brief?.atmosphere.lighting,
    brief?.atmosphere.color_grading,
    brief?.atmosphere.mood,
  ].filter(Boolean);
  return parts.length
    ? `REFERENCE SCENE LOCK: ${parts.join("; ")}`
    : "то же окружение и свет, что заданы сценой сегмента";
}

function renderStoryboardWardrobe(
  characterContract: OmniCharacterContract,
  brief?: DirectorBrief | null,
  wardrobeSource?: OmniWardrobeSource
) {
  if (normalizeOmniWardrobeSource(wardrobeSource) === "avatar_reference") return characterContract.clothingLine;
  if (!brief?.clothing.style) return characterContract.clothingLine;
  const colors = brief.clothing.color_palette.length ? `colors: ${brief.clothing.color_palette.join(", ")}` : "";
  return [
    "REFERENCE WARDROBE LOCK:",
    brief.clothing.style,
    brief.clothing.fit_details,
    colors,
    brief.clothing.adaptation_notes,
  ].filter(Boolean).join("; ");
}

function renderDirectorCamera(brief?: DirectorBrief | null) {
  if (!brief) return "";
  return compactText([
    "reference camera lock:",
    brief.camera.shot_types.join(", "),
    brief.camera.angles.length ? `angles ${brief.camera.angles.join(", ")}` : "",
    brief.camera.movements.length ? `movement ${brief.camera.movements.join(", ")}` : "",
    brief.camera.stabilization,
  ].filter(Boolean).join("; "), 220);
}

function renderFrameEffect(frameIndex: number, frameCount: number, isCutawayFrame: boolean) {
  if (isCutawayFrame) return `${CLEAN_STORYBOARD_STYLE}; быстрый match cut или короткий punch in без графических стикеров`;
  if (frameIndex === 1) return `${CLEAN_STORYBOARD_STYLE}; сильный UGC hook кадр с легким handheld стартом`;
  if (frameIndex === frameCount) return `${CLEAN_STORYBOARD_STYLE}; короткая стабилизация на финальную реплику`;
  return `${CLEAN_STORYBOARD_STYLE}; быстрый живой jump cut между репликами`;
}

function renderPromptChainProductPlacement(productState: string | null | undefined, productPhysicalHint?: string | null) {
  const state = productState?.trim() || "продукт следует физическому состоянию storyboard";
  if (/вне\s+кадра|не\s+виден|hidden|off\s*camera/iu.test(state)) return state;
  return appendProductPhysicalHint(
    `${state}; продукт физически виден как реальный предмет с деталями из product reference`,
    productPhysicalHint
  );
}

function renderProductPlacement(
  plan: OmniSegmentCreativePlan,
  productName: string,
  productVisualPassport?: string | null,
  productPhysicalHint?: string | null
) {
  const productDetails = productVisualPassport ? `, детали из референса: ${compactProductReference(productVisualPassport)}` : "";
  if (plan.productRole === "hidden") return `${productName} вне кадра в этом сегменте`;
  if (plan.productRole === "brief_demo") {
    return appendProductPhysicalHint(
      `${productName} обязательно физически виден в коротком действии с рукой${productDetails}`,
      productPhysicalHint
    );
  }
  if (plan.productRole === "natural_use") {
    return appendProductPhysicalHint(
      `${productName} обязательно физически виден и используется как естественный предмет сцены${productDetails}`,
      productPhysicalHint
    );
  }
  return appendProductPhysicalHint(
    `${productName} обязательно физически виден как реальный предмет в окружении${productDetails}`,
    productPhysicalHint
  );
}

function appendProductPhysicalHint(base: string, productPhysicalHint?: string | null) {
  const hint = productPhysicalHint?.trim();
  return hint ? `${base}; ${hint}` : base;
}

function renderFrameAction(action: string | undefined, isCutawayFrame: boolean) {
  const normalized = compactText(action || "персонаж естественно говорит в камеру", 220);
  const visualCue = extractVisualCue(normalized);
  if (visualCue) {
    return isCutawayFrame
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

function splitIntoFrameSpeech(words: string[], frameCount: number) {
  const chunks: string[] = [];
  let cursor = 0;
  for (let index = 0; index < frameCount; index += 1) {
    const remainingFrames = frameCount - index;
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
