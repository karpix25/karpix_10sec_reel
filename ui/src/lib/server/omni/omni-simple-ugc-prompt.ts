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
import { renderOmniNaturalismContract } from "./omni-naturalism-contract";
import { normalizeOmniWardrobeSource, type OmniWardrobeSource } from "../../omni/wardrobe-source";
import {
  applyWardrobeSourceToReferenceLock,
  renderAvatarWardrobeLine,
  renderAvatarWardrobeSourceRule,
  shouldUseAvatarWardrobe,
} from "./omni-wardrobe-contract";

export function renderSimpleFullBodyUgcPrompt(input: {
  plan: OmniSegmentCreativePlan;
  strategy: OmniCreativeStrategy;
  characterContract: OmniCharacterContract;
  productName: string;
  productVisualPassport?: string | null;
  productPhysicalityContract?: string | null;
  segmentIndex: number;
  segmentCount: number;
  directorGuidance?: string | null;
  directorBrief?: DirectorBrief | null;
  referencePolicy?: ReferenceTransferPolicy;
  wardrobeSource?: OmniWardrobeSource;
  continuityDirection?: OmniGenerationContinuityDirection;
}) {
  const duration = input.plan.beats[2]?.endSeconds || 10;
  const wordCount = input.plan.voiceoverText.split(/\s+/).filter(Boolean).length;
  const referencePolicy = input.referencePolicy || { mode: "full_reference" as const, omitRawDirectorGuidance: false };
  const directorScene = buildDirectorSceneContract(input.directorBrief || null, referencePolicy);
  const wardrobeSource = normalizeOmniWardrobeSource(input.wardrobeSource);
  const useAvatarWardrobe = shouldUseAvatarWardrobe(wardrobeSource);
  const referenceLockLine = directorScene
    ? applyWardrobeSourceToReferenceLock({ referenceLockLine: directorScene.referenceLockLine, wardrobeSource })
    : null;
  const wardrobeLine = useAvatarWardrobe
    ? renderAvatarWardrobeLine(input.characterContract)
    : directorScene?.wardrobeLine ||
      `${input.characterContract.clothingLine}. Use real fabric texture and ordinary wrinkles; no brand marks or logos.`;
  const sourceRuleLine = useAvatarWardrobe
    ? renderAvatarWardrobeSourceRule(input.characterContract)
    : input.characterContract.sourceRuleLine;
  const scriptBeatGuidance = renderScriptBeatGuidance(input.plan.scriptBeats, { wardrobeSource });
  const talkingHead = input.plan.lifeFormatId === "talking_head_cutaways";
  const props = input.plan.continuityProps
    .map((item) => `${item.name}: ${item.appearance}; начальная позиция: ${item.initialPosition}`)
    .join(" | ");
  const continuity = input.segmentIndex < input.segmentCount
    ? "Finish in a stable standing pose that can continue into the next segment."
    : "End exactly after the last spoken word, without adding another CTA.";

  return [
    `Raw vertical video recording, 9:16 aspect ratio, ${duration.toFixed(0)}s duration.`,
    renderOmniNaturalismContract(),
    referenceLockLine ||
      "REFERENCE LOCK: no external director reference is available; use an ordinary real-life UGC room with no subtitles or overlays.",
    directorScene?.framingLine ||
      "FRAMING: raw smartphone camera recording, steady enough to watch but still human, person clearly visible, no forced full-body framing.",
    ...(directorScene?.layoutLine ? [directorScene.layoutLine] : []),
    directorScene?.cameraLightLine || "CAMERA: raw smartphone camera recording, slight natural breathing movement, believable room light with soft falloff and tiny exposure shifts.",
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
    `ОДЕЖДА: ${wardrobeLine}`,
    `ИСТОЧНИКИ ОБРАЗА: ${sourceRuleLine}.`,
    `ПРОДУКТ: ${input.productName}. ${productLine(input.plan.productRole)}`,
    ...(input.productVisualPassport ? [input.productVisualPassport] : []),
    ...(input.productPhysicalityContract && input.plan.productRole !== "hidden" ? [input.productPhysicalityContract] : []),
    directorScene?.propPassportLine || `ПАСПОРТ РЕКВИЗИТА ДЛЯ ВСЕХ ЧАСТЕЙ: ${props}.`,
    ...(input.continuityDirection?.promptLines || []),
    `СТАРТ РЕЧИ: первое слово точной реплики звучит в первом кадре на 0.0 секунде; герой уже стоит в кадре и смотрит в камеру.`,
    `ТОЧНАЯ РЕПЛИКА (${wordCount} слов): "${input.plan.voiceoverText}"`,
    ...(scriptBeatGuidance ? [scriptBeatGuidance] : []),
    `SHOT PLAN:\n${renderShotPlan(input.plan)}`,
    "SPEECH TIMING: Russian, energetic delivery; the exact quote should occupy almost the whole clip with no long pauses between phrases. Speak the complete exact quote for this segment once only; do not paraphrase, skip words, restart, continue a neighboring segment, or add subtitles.",
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
  if (role === "hidden") return "Do not show the product in this segment; keep the story personal. Never introduce it as a pasted image, overlay, or sudden object.";
  if (role === "background_prop") {
    return "Use it as a real physical prop in the scene, with subtle hand-driven movement, contact shadows, finger occlusion, and visible cause for every movement when visible. If the original reference has a visible main product, replace it with this product while preserving the same placement, timing, framing, and visual importance.";
  }
  return "Use it as a real physical prop, not as an overlay or still image. Keep contact shadows, hand occlusion, gravity, and perspective change visible. If the original reference shows a held or demonstrated product, replace that original product with this product while preserving the same gesture, timing, framing, and naturalness.";
}
