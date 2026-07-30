import type { OmniPromptValidationResult, OmniSegmentCreativePlan } from "../../../omni/creative-contract";
import {
  OMNI_STORYBOARD_MAX_FRAME_WORDS,
  OMNI_STORYBOARD_MIN_FRAME_WORDS,
  getOmniStoryboardFrameCount,
  type OmniStoryboardFrame,
  type OmniStoryboardSegment,
  type OmniStoryboardValidationResult,
} from "../../../omni/storyboard/omni-storyboard-types";
import { validateOmniStoryboardSegment } from "../../../omni/storyboard/omni-storyboard-contract";
import type { OmniCharacterContract } from "../omni-character-contract";
import type { StoryboardFrame } from "../llm-prompt-chain-types";
import type { DirectorBrief } from "../director-analysis-types";
import { normalizeOmniWardrobeSource, type OmniWardrobeSource } from "../../../omni/wardrobe-source";
import { mentionsOmniProduct } from "../omni-intro-product-contract";

const EXACT_FABRIC_LOCK =
  "ONE EXACT FABRIC FOR THE WHOLE REEL: preserve the same fiber material, weave, density, surface texture, seams, cut, and fit established in the first frame across every frame and segment";

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
        segmentIndex: input.segmentIndex,
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
      wardrobe: `одежда из avatar или reference contract, без смены между кадрами; ${EXACT_FABRIC_LOCK}`,
      productPlacement: renderPromptChainProductPlacement(frame.productState, input.productPhysicalHint),
      sfxNotes: frame.sfx || "естественные звуки сцены и речи",
      effectNotes: null,
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
  segmentIndex: number;
  spokenText: string;
  frameIndex: number;
  frameCount: number;
}): OmniStoryboardFrame {
  const startSeconds = (input.frameIndex - 1) * 2;
  const beat = input.plan.beats.find((item) => startSeconds >= item.startSeconds && startSeconds < item.endSeconds) ||
    input.plan.beats[0];
  const cutawayFrameIndex = Math.ceil(input.frameCount / 2);
  const isCutawayFrame = input.frameIndex === cutawayFrameIndex;
  const visualAction = input.segmentIndex === 1 && input.plan.productRole === "hidden"
    ? renderIntroFrameAction(beat?.action, isCutawayFrame, input.productName)
    : renderFrameAction(beat?.action, isCutawayFrame);
  const productVisible = input.plan.productRole !== "hidden" &&
    mentionsOmniProduct(`${input.spokenText} ${visualAction}`, input.productName);

  return {
    spokenText: input.spokenText,
    visualAction,
    camera: renderFrameCamera(
      input.frameIndex,
      input.frameCount,
      isCutawayFrame,
      renderDirectorCamera(input.directorBrief, productVisible),
      productVisible
    ),
    environment: renderDirectorEnvironment(input.directorBrief),
    wardrobe: renderStoryboardWardrobe(input.characterContract, input.directorBrief, input.wardrobeSource),
    productPlacement: renderProductPlacement(
      input.plan,
      input.productName,
      input.productVisualPassport,
      input.productPhysicalHint,
      input.segmentIndex,
      productVisible
    ),
    sfxNotes: isCutawayFrame
      ? productVisible
        ? "естественный звук короткого действия с продуктом"
        : "естественный звук предметов и окружения текущей сцены"
      : "тихие естественные звуки комнаты и живой речи",
    effectNotes: null,
    modelMusicNotes: null,
  };
}

function renderFrameCamera(
  frameIndex: number,
  frameCount: number,
  isCutawayFrame: boolean,
  directorCamera: string,
  productVisible: boolean
) {
  const base = isCutawayFrame
    ? productVisible
      ? "смысловая перебивка: крупный кадр продукта в естественном окружении"
      : "смысловая перебивка: предметный или атмосферный кадр по текущей реплике"
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
  if (normalizeOmniWardrobeSource(wardrobeSource) === "avatar_reference") {
    return `${characterContract.clothingLine}; ${EXACT_FABRIC_LOCK}`;
  }
  if (characterContract.speechGender === "male" && isClearlyFemaleWardrobe(brief)) {
    return `${characterContract.clothingLine}; ${EXACT_FABRIC_LOCK}`;
  }
  if (!brief?.clothing.style) return `${characterContract.clothingLine}; ${EXACT_FABRIC_LOCK}`;
  const colors = brief.clothing.color_palette.length ? `colors: ${brief.clothing.color_palette.join(", ")}` : "";
  return [
    "REFERENCE WARDROBE LOCK:",
    brief.clothing.style,
    brief.clothing.fit_details,
    colors,
    "ONE EXACT OUTFIT FOR THE WHOLE REEL: keep the same garments, layers, neckline, sleeves, fit, accessories, and color placement in every frame and every segment",
    EXACT_FABRIC_LOCK,
    "if a jacket, blazer, overshirt, or shirt layer is present, it stays on and is not replaced by a t-shirt or a different shirt",
  ].filter(Boolean).join("; ");
}

function renderDirectorCamera(brief: DirectorBrief | null | undefined, productVisible: boolean) {
  if (!brief) return "";
  const shotTypes = productVisible
    ? brief.camera.shot_types
    : brief.camera.shot_types.filter((shotType) => !/product|packag|продукт|упаков/iu.test(shotType));
  return compactText([
    "reference camera lock:",
    shotTypes.join(", "),
    brief.camera.angles.length ? `angles ${brief.camera.angles.join(", ")}` : "",
    brief.camera.movements.length ? `movement ${brief.camera.movements.join(", ")}` : "",
    brief.camera.stabilization,
  ].filter(Boolean).join("; "), 220);
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
  productPhysicalHint?: string | null,
  segmentIndex?: number,
  productVisible = false
) {
  const productDetails = productVisualPassport ? `, детали из референса: ${compactProductReference(productVisualPassport)}` : "";
  if (plan.productRole === "hidden") return "продукт вне кадра в этом сегменте";
  if (!productVisible) {
    return "в кадре только тематические объекты и окружение текущей реплики";
  }
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

function isClearlyFemaleWardrobe(brief?: DirectorBrief | null) {
  const clothing = [
    brief?.clothing.style,
    brief?.clothing.fit_details,
    brief?.clothing.adaptation_notes,
    ...(brief?.clothing.color_palette || []),
  ].filter(Boolean).join(" ");
  return /halter|bra\b|bustier|corset|dress|skirt|women'?s|feminine|бюстгальтер|корсет|плать|юбк|женск|топ\s+на\s+бретел/iu.test(clothing);
}

function renderFrameAction(action: string | undefined, isCutawayFrame: boolean) {
  const normalized = compactText(action || "персонаж естественно говорит в камеру", 220);
  if (/REFERENCE LAYOUT|collage\/PIP/iu.test(normalized)) return normalized;
  const visualCue = extractVisualCue(normalized);
  if (visualCue) {
    return isCutawayFrame
      ? `короткая перебивка: ${visualCue}`
      : `персонаж говорит в камеру, визуальный ориентир: ${visualCue}`;
  }
  return compactText(normalized, 180);
}

function renderIntroFrameAction(action: string | undefined, isCutawayFrame: boolean, productName: string) {
  const visualCue = extractVisualCue(compactText(action || "", 220));
  if (isCutawayFrame && visualCue && !mentionsOmniProduct(visualCue, productName)) {
    return `смысловой предметный или атмосферный кадр по хуку: ${visualCue}`;
  }
  return isCutawayFrame
    ? "смысловой кадр окружения по теме хука"
    : "персонаж с пустыми руками естественно говорит в камеру";
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
