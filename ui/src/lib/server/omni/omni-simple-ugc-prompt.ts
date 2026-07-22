import type {
  OmniCreativeStrategy,
  OmniSegmentCreativePlan,
  ProductRole,
} from "@/lib/omni/creative-contract";
import type { OmniCharacterContract } from "./omni-character-contract";
import type { DirectorBrief } from "./director-analysis-types";
import { buildDirectorSceneContract } from "./director-scene-contract";
import type { ReferenceTransferPolicy } from "./omni-reference-transfer-policy";
import { renderScriptBeatGuidance } from "./script-beat-plan";
import { OMNI_NO_VISIBLE_FILMING_GEAR_PROMPT } from "./omni-scene-safety-contract";
import type { OmniGenerationContinuityDirection } from "./omni-generation-continuity";

export function renderSimpleFullBodyUgcPrompt(input: {
  plan: OmniSegmentCreativePlan;
  strategy: OmniCreativeStrategy;
  characterContract: OmniCharacterContract;
  productName: string;
  productVisualPassport?: string | null;
  segmentIndex: number;
  segmentCount: number;
  directorGuidance?: string | null;
  directorBrief?: DirectorBrief | null;
  referencePolicy?: ReferenceTransferPolicy;
  continuityDirection?: OmniGenerationContinuityDirection;
}) {
  const duration = input.plan.beats[2]?.endSeconds || 10;
  const wordCount = input.plan.voiceoverText.split(/\s+/).filter(Boolean).length;
  const referencePolicy = input.referencePolicy || { mode: "full_reference" as const, omitRawDirectorGuidance: false };
  const directorScene = buildDirectorSceneContract(input.directorBrief || null, referencePolicy);
  const scriptBeatGuidance = renderScriptBeatGuidance(input.plan.scriptBeats);
  const talkingHead = input.plan.lifeFormatId === "talking_head_cutaways";
  const props = input.plan.continuityProps
    .map((item) => `${item.name}: ${item.appearance}; начальная позиция: ${item.initialPosition}`)
    .join(" | ");
  const continuity = input.segmentIndex < input.segmentCount
    ? "Finish in a stable standing pose that can continue into the next segment."
    : "End exactly after the last spoken word, without adding another CTA.";

  return [
    `Raw vertical video recording, 9:16 aspect ratio, ${duration.toFixed(0)}s duration.`,
    directorScene?.referenceLockLine ||
      "REFERENCE LOCK: no external director reference is available; use a clean realistic UGC scene with no subtitles or overlays.",
    directorScene?.framingLine ||
      "FRAMING: raw smartphone camera recording, stable portrait composition, person clearly visible, no forced full-body framing.",
    ...(directorScene?.layoutLine ? [directorScene.layoutLine] : []),
    directorScene?.cameraLightLine || "CAMERA: raw smartphone camera recording, slight natural breathing movement, bright domestic light, high quality sensor output.",
    directorScene?.editingLine ||
      "EDITING RHYTHM: simple clean cuts only when needed; no subtitles, captions, progress bars, or interface overlays.",
    ...(talkingHead
      ? ["FORMAT: ГОВОРЯЩАЯ ГОЛОВА С ПЕРЕБИВКАМИ. Main shot is face-to-camera; cutaway is short, calm, and tied to the script with real object placement or hand contact."]
      : []),
    ...(input.directorGuidance && !referencePolicy.omitRawDirectorGuidance
      ? [`REFERENCE VIDEO DIRECTION:\n${input.directorGuidance}`]
      : []),
    directorScene?.sceneLine || `SCENE: ${input.strategy.setting}.`,
    `ГЛАВНЫЙ ПЕРСОНАЖ: ${input.characterContract.identityLine}.`,
    `ОДЕЖДА: ${directorScene?.wardrobeLine || `${input.characterContract.clothingLine}. Use solid matte colors only; no stripes, checks, brand marks, or logos.`}`,
    `ИСТОЧНИКИ ОБРАЗА: ${input.characterContract.sourceRuleLine}.`,
    `ПРОДУКТ: ${input.productName}. ${productLine(input.plan.productRole)}`,
    ...(input.productVisualPassport ? [input.productVisualPassport] : []),
    directorScene?.propPassportLine || `ПАСПОРТ РЕКВИЗИТА ДЛЯ ВСЕХ ЧАСТЕЙ: ${props}.`,
    ...(input.continuityDirection?.promptLines || []),
    `СТАРТ РЕЧИ: первое слово точной реплики звучит в первом кадре на 0.0 секунде; герой уже стоит в кадре и смотрит в камеру.`,
    `ТОЧНАЯ РЕПЛИКА (${wordCount} слов): "${input.plan.voiceoverText}"`,
    ...(scriptBeatGuidance ? [scriptBeatGuidance] : []),
    `SHOT PLAN:\n${renderShotPlan(input.plan)}`,
    "SPEECH TIMING: Russian, energetic delivery; the exact quote should occupy almost the whole clip with no long pauses between phrases. Speak only the exact quote once, no subtitles.",
    directorScene?.actionLine ||
      "ACTION: keep it simple and tied to speech; do not invent unrelated filler actions.",
    `CONTINUITY: same person, outfit, room, light, product appearance, and prop layout across the segment. ${continuity}`,
    directorScene?.cleanFrameLine ||
      "CLEAN FRAME: only the raw environment and the person are visible. No on-screen text, subtitles, captions, progress bars, overlay icons, buttons, watermarks, logos, or app interfaces.",
    OMNI_NO_VISIBLE_FILMING_GEAR_PROMPT,
  ].join("\n");
}

function renderShotPlan(plan: OmniSegmentCreativePlan) {
  return plan.beats
    .map((beat) => `${beat.startSeconds.toFixed(1)}-${beat.endSeconds.toFixed(1)}s: ${beat.action}.`)
    .join("\n");
}

function productLine(role: ProductRole) {
  if (role === "hidden") return "Do not show the product in this segment; keep the story personal.";
  if (role === "background_prop") {
    return "Use it as a real physical prop in the scene, with subtle hand-driven movement when visible. If the original reference has a visible main product, replace it with this product while preserving the same placement, timing, framing, and visual importance.";
  }
  return "Use it as a real physical prop, not as an overlay or still image. If the original reference shows a held or demonstrated product, replace that original product with this product while preserving the same gesture, timing, framing, and naturalness.";
}
