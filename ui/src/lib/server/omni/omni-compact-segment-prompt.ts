import type {
  OmniCreativeStrategy,
  OmniSegmentCreativePlan,
  ProductRole,
} from "@/lib/omni/creative-contract";
import { normalizeOmniWardrobeSource, type OmniWardrobeSource } from "../../omni/wardrobe-source";
import type { OmniCharacterContract } from "./omni-character-contract";
import type { DirectorBrief } from "./director-analysis-types";
import { buildDirectorLayoutContract } from "./director-layout-contract";
import { buildCompactReferenceBrief } from "./omni-reference-brief";
import type { OmniGenerationContinuityDirection } from "./omni-generation-continuity";
import { renderOmniNaturalismContract } from "./omni-naturalism-contract";
import type { ReferenceTransferPolicy } from "./omni-reference-transfer-policy";
import { OMNI_NO_VISIBLE_FILMING_GEAR_PROMPT } from "./omni-scene-safety-contract";
import { renderScriptBeatGuidance } from "./script-beat-plan";
import { renderOmniVerticalRhythmContract } from "./omni-vertical-rhythm-contract";

export function renderCompactSegmentPrompt(input: {
  plan: OmniSegmentCreativePlan;
  strategy: OmniCreativeStrategy;
  characterContract: OmniCharacterContract;
  productName: string;
  productVisualPassport?: string | null;
  productPhysicalityContract?: string | null;
  segmentIndex: number;
  segmentCount: number;
  directorBrief?: DirectorBrief | null;
  referencePolicy: ReferenceTransferPolicy;
  wardrobeSource: OmniWardrobeSource;
  continuityLines?: readonly string[];
  continuityDirection?: OmniGenerationContinuityDirection;
  segmentStartSeconds?: number;
  segmentEndSeconds?: number;
}) {
  const wardrobeSource = normalizeOmniWardrobeSource(input.wardrobeSource);
  const duration = input.plan.beats[input.plan.beats.length - 1]?.endSeconds || 10;
  const segmentStartSeconds = input.segmentStartSeconds ?? (input.segmentIndex - 1) * duration;
  const segmentEndSeconds = input.segmentEndSeconds ?? segmentStartSeconds + duration;
  const referenceBrief = buildCompactReferenceBrief({
    brief: input.directorBrief || null,
    strategy: input.strategy,
    characterContract: input.characterContract,
    segmentIndex: input.segmentIndex,
    segmentCount: input.segmentCount,
    segmentDurationSeconds: duration,
    segmentStartSeconds,
    segmentEndSeconds,
    wardrobeSource,
    referencePolicy: input.referencePolicy,
  });
  const layoutContract = buildDirectorLayoutContract(input.directorBrief || null, input.referencePolicy);
  const scriptBeatGuidance = renderScriptBeatGuidance(input.plan.scriptBeats, { wardrobeSource });
  const props = input.plan.continuityProps
    .map((item) => `${item.name}: ${item.appearance}; start: ${item.initialPosition}`)
    .join(" | ");
  const talkingHead = input.plan.lifeFormatId === "talking_head_cutaways";
  const continuity = input.segmentIndex < input.segmentCount
    ? "End in a stable believable state that the next part can continue from."
    : "End after the last spoken word without adding a new phrase or CTA.";

  return [
    `RAW VERTICAL VIDEO: 9:16, ${duration.toFixed(0)} seconds, natural phone footage.`,
    renderOmniNaturalismContract(),
    renderOmniVerticalRhythmContract({
      talkingHead,
      segmentIndex: input.segmentIndex,
      segmentCount: input.segmentCount,
    }),
    referenceBrief.referenceLine,
    layoutContract?.layoutLine,
    referenceBrief.locationLine,
    referenceBrief.cameraLine,
    talkingHead ? "FORMAT: ГОВОРЯЩАЯ ГОЛОВА С ПЕРЕБИВКАМИ. Face-to-camera with short product-relevant cutaways, not copied reference montage." : null,
    `CHARACTER: ${input.characterContract.identityLine}.`,
    referenceBrief.wardrobeLine,
    `PRODUCT: ${input.productName}. ${renderProductRole(input.plan.productRole)}`,
    input.productVisualPassport,
    input.productPhysicalityContract && input.plan.productRole !== "hidden" ? input.productPhysicalityContract : null,
    layoutContract?.propPassportLine || `PROP CONTINUITY: ${props}.`,
    ...(input.continuityDirection?.promptLines || input.continuityLines || []),
    "SCENE ACTION:",
    ...input.plan.beats.map((beat) => `${beat.startSeconds.toFixed(1)}-${beat.endSeconds.toFixed(1)}s: ${beat.action}.`),
    scriptBeatGuidance || null,
    referenceBrief.actionLine,
    "SPEECH:",
    "Start speaking on frame 0. Use simple natural conversational Russian. Say only the current part once. Do not repeat, skip, restart, paraphrase, continue a neighbor part, or add subtitles.",
    `The avatar says: ${input.plan.voiceoverText}`,
    `CONTINUITY: same identity, adapted outfit, location, light, product appearance, and physical prop positions unless the reference location timeline changes for this part. ${continuity}`,
    "CLEAN FRAME: no on-screen text, subtitles, captions, progress bars, overlay icons, buttons, watermarks, logos, or app interface.",
    OMNI_NO_VISIBLE_FILMING_GEAR_PROMPT,
  ].filter(Boolean).join("\n");
}

function renderProductRole(role: ProductRole) {
  if (role === "hidden") {
    return "Do not show the product in this part.";
  }
  if (role === "background_prop") {
    return "When visible, keep it a real object in the scene with contact shadows, perspective, and one simple hand/camera-driven movement.";
  }
  if (role === "brief_demo") {
    return "Show one short physical product interaction: pick up, turn slightly, or place down with visible hand contact.";
  }
  return "Use it as a real routine object, never as a pasted still image or overlay.";
}
