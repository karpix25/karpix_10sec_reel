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
import {
  OMNI_NO_VISIBLE_FILMING_GEAR_PROMPT,
  OMNI_REFERENCE_PRODUCT_EXCLUSION_PROMPT,
} from "./omni-scene-safety-contract";
import { renderScriptBeatGuidance } from "./script-beat-plan";
import { renderOmniVerticalRhythmContract } from "./omni-vertical-rhythm-contract";
import { isVoiceoverMontageReference, resolveReferenceFormatMode } from "./omni-reference-format-mode";
import { isAvatarFreeReferenceScene, isFacelessReferenceScene, isObjectOnlyReferenceScene, resolveReferenceSceneMode } from "./omni-reference-scene-mode";
import { renderVisibleSubjectPolicy, resolveDirectorVisibleSubjectPolicy } from "./director-visibility-policy";

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
    referenceSceneMode: resolveReferenceSceneMode(input.directorBrief),
  });
  const layoutContract = buildDirectorLayoutContract(input.directorBrief || null, input.referencePolicy);
  const scriptBeatGuidance = renderScriptBeatGuidance(input.plan.scriptBeats, { wardrobeSource });
  const props = input.plan.continuityProps
    .map((item) => `${item.name}: ${item.appearance}; start: ${item.initialPosition}`)
    .join(" | ");
  const talkingHead = input.plan.lifeFormatId === "talking_head_cutaways" && input.plan.referenceSceneMode === "presenter";
  const montageReference = isVoiceoverMontageReference(resolveReferenceFormatMode(input.directorBrief));
  const referenceSceneMode = resolveReferenceSceneMode(input.directorBrief);
  const visibleSubjectPolicy = resolveDirectorVisibleSubjectPolicy(input.directorBrief);
  const noPeopleReference = visibleSubjectPolicy === "no_people";
  const facelessReferenceScene = isFacelessReferenceScene(referenceSceneMode);
  const avatarFreeReferenceScene = isAvatarFreeReferenceScene(referenceSceneMode);
  const voiceoverBrollReference = referenceSceneMode === "voiceover_broll";
  const timelineModes = new Set((input.directorBrief?.camera_timeline || []).map((item) => item.speech_mode));
  const hybridDelivery = timelineModes.has("on_camera") && timelineModes.has("voiceover_only");
  const objectOnlyReferenceScene = isObjectOnlyReferenceScene(referenceSceneMode);
  const wardrobeContinuity = input.directorBrief?.wardrobe_continuity || "unknown";
  const wardrobeDirection = wardrobeContinuity === "stable"
    ? "Одежду сохраняй неизменной только потому, что именно так указал анализатор для этого субъекта."
    : wardrobeContinuity === "changes_between_cuts"
      ? "Одежду бери из wardrobe каждого соответствующего storyboard кадра; смена между независимыми перебивками разрешена анализатором."
      : wardrobeContinuity === "not_visible"
        ? "Одежду не выдумывай и не проверяй, потому что в reference она не видна."
        : "Не делай вывод об одинаковой или разной одежде из формата; следуй только одежде, указанной в текущем storyboard кадре.";
  const continuity = montageReference
    ? "This is an independent montage segment. Do not continue the previous segment's room, camera, or prop positions; preserve subject identity only when the director analysis marks it as continuous, and preserve exact product appearance."
    : objectOnlyReferenceScene
      ? "Keep the same approved surface, macro camera, light, and conceptual props; never introduce a person, hands, face, head, or avatar."
      : facelessReferenceScene
        ? "Keep the same approved hands, body crop, camera, light, and props; never introduce a face, head, or avatar."
      : voiceoverBrollReference
        ? noPeopleReference
          ? "Keep each independent B-roll cut tied to its reference frame; do not add people, hands, or an avatar."
          : "Keep each independent B-roll cut tied to its reference frame; keep the saved avatar as the silent visual protagonist and never turn the cut into talking-head."
    : input.segmentIndex < input.segmentCount
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
    talkingHead
      ? montageReference
        ? "FORMAT: VOICEOVER MONTAGE. Off-camera narration carries one idea across independent cutaways with the same presenter identity; do not force one physical scene across segments."
        : "FORMAT: ГОВОРЯЩАЯ ГОЛОВА С ПЕРЕБИВКАМИ. Face-to-camera with short product-relevant cutaways, not copied reference montage."
      : voiceoverBrollReference
        ? noPeopleReference
          ? "FORMAT: VOICEOVER B-ROLL. Off-camera narration over independent cutaways; no people, hands, avatar, talking-head, or lip-sync."
          : "FORMAT: VOICEOVER B-ROLL. Off-camera narration over independent cutaways led by the saved silent avatar; no talking-head or lip-sync."
      : hybridDelivery
        ? "FORMAT: HYBRID DELIVERY. Follow each reference interval's speech_mode: on_camera means the avatar speaks visibly; voiceover_only means the same avatar performs silent independent B-roll with off-camera narration. Any visible human is the saved avatar; never generate another person."
      : null,
    renderVisibleSubjectPolicy(visibleSubjectPolicy),
    objectOnlyReferenceScene
      ? "VISIBLE SUBJECT: object-only macro scene; no person, hands, face, head, or avatar."
      : noPeopleReference
        ? "VISIBLE SUBJECT: only locations, objects, approved product screens, and atmospheric B-roll; no people, hands, face, head, or avatar."
      : avatarFreeReferenceScene
        ? "VISIBLE SUBJECT: no main avatar; narration is off-camera over approved independent B-roll, with incidental visible people allowed only when the reference requires them."
      : `CHARACTER: ${input.characterContract.identityLine}.`,
    referenceBrief.wardrobeLine,
    `PRODUCT: ${input.productName}. ${renderProductRole(input.plan.productRole)}`,
    OMNI_REFERENCE_PRODUCT_EXCLUSION_PROMPT,
    input.productVisualPassport,
    input.productPhysicalityContract && input.plan.productRole !== "hidden" && input.plan.productRole !== "digital_demo" ? input.productPhysicalityContract : null,
    layoutContract?.propPassportLine || `PROP CONTINUITY: ${props}.`,
    ...(input.continuityDirection?.promptLines || input.continuityLines || []),
    "SCENE ACTION:",
    ...input.plan.beats.map((beat) => `${beat.startSeconds.toFixed(1)}-${beat.endSeconds.toFixed(1)}s: ${beat.action}.`),
    scriptBeatGuidance || null,
    referenceBrief.actionLine,
    "SPEECH:",
    "Start speaking on frame 0. Use simple natural conversational Russian. Say only the current part once. Do not repeat, skip, restart, paraphrase, continue a neighbor part, or add subtitles.",
    `${voiceoverBrollReference || avatarFreeReferenceScene ? "The off-camera narrator says" : hybridDelivery ? "The avatar or off-camera narrator says according to each storyboard frame's speech_mode" : "The avatar says"}: ${input.plan.voiceoverText}`,
    `CONTINUITY: ${montageReference ? "same identity only when the reference analysis requires it; each independent cut follows its corresponding reference setup" : objectOnlyReferenceScene ? "same surface, macro light, camera, conceptual props, and physical action order" : facelessReferenceScene ? "same hands, body crop, light, camera, and physical prop positions" : "same identity, analyzed wardrobe policy, location, light, product appearance, and physical prop positions unless the reference timeline changes"}. ${wardrobeDirection} ${continuity}`,
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
  if (role === "digital_demo") {
    return "Show only the approved product screen on a smartphone when the storyboard calls for it; never turn it into a plastic card, package, or physical prop.";
  }
  return "Use it as a real routine object, never as a pasted still image or overlay.";
}
