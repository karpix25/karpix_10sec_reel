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
import { renderDirectorTimelineForPrompt, resolveDirectorSegmentFormat } from "./director-analysis-timeline";
import { OMNI_PRODUCT_BROLL_RULE } from "./omni-product-broll-contract";

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
  const strictReference = input.referencePolicy.mode === "full_reference";
  const detailedTimeline = strictReference;
  const wardrobeDirection = strictReference
    ? wardrobeContinuity === "not_visible"
      ? "Одежду не выдумывай, если она не нужна текущей сцене; если reference показывает женскую одежду, для мужского аватара используй avatar-compatible equivalent, сохраняя цвет, материал, силуэт, посадку и формальность."
      : "Сохраняй одежду из проверенного source interval; для мужского аватара замени женские предметы на avatar-compatible equivalent, сохранив цвет, материал, силуэт, посадку, слой и формальность."
    : wardrobeContinuity === "not_visible"
    ? "Одежду не выдумывай, если она не нужна текущей сцене."
    : "Используй простой outfit из новой раскадровки; точное совпадение с reference не требуется.";
  const continuity = strictReference
    ? montageReference
      ? "Preserve each analyzed source interval's location, light, camera, composition, and presenter-versus-B-roll distribution; independent changes are allowed only at explicit analyzed cuts."
      : objectOnlyReferenceScene
        ? "Keep the same approved surface, macro camera, light, and conceptual props; never introduce a person, hands, face, head, or avatar."
        : facelessReferenceScene
          ? "Keep the same approved hands, body crop, camera, light, and props; never introduce a face, head, or avatar."
          : "Preserve the verified source location, light, camera, composition, presenter-versus-B-roll distribution, and physical state. Only explicit analyzed cuts may change them."
    : montageReference
    ? "This is an original independent montage segment. Preserve the featured avatar identity and exact product form; room, camera, clothes, and props may change for the new scene."
    : objectOnlyReferenceScene
      ? "Keep the same approved surface, macro camera, light, and conceptual props; never introduce a person, hands, face, head, or avatar."
      : facelessReferenceScene
        ? "Keep the same approved hands, body crop, camera, light, and props; never introduce a face, head, or avatar."
      : voiceoverBrollReference
      ? noPeopleReference
          ? "Create independent script-relevant B-roll without a featured person."
          : "Create independent script-relevant B-roll; any featured human uses the saved avatar, while background people and visible speaking are allowed."
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
      ? strictReference && detailedTimeline
        ? "FORMAT: SOURCE-LOCKED DELIVERY. Follow each verified source interval's presenter/B-roll role and speech mode; do not add cutaways or change the physical scene unless the timeline contains that cut."
        : montageReference
        ? "FORMAT: VOICEOVER MONTAGE. Off-camera narration carries one idea across independent cutaways with the same presenter identity; do not force one physical scene across segments."
        : "FORMAT: ГОВОРЯЩАЯ ГОЛОВА С ПЕРЕБИВКАМИ. Face-to-camera with short product-relevant cutaways, not copied reference montage."
      : voiceoverBrollReference
        ? noPeopleReference
          ? "FORMAT: VOICEOVER B-ROLL. Off-camera narration over independent cutaways; no people, hands, avatar, talking-head, or lip-sync."
          : "FORMAT: DIRECTOR-LED B-ROLL. Create original cutaways for the current line; any featured human uses the saved avatar. Visible speaking and background people are allowed."
      : hybridDelivery
        ? "FORMAT: DIRECTOR-LED HYBRID. Use the saved avatar for any featured human and create the speaking or B-roll delivery that best serves the current line. Background people and exact mouth state are not continuity requirements."
      : null,
    renderVisibleSubjectPolicy(visibleSubjectPolicy),
    detailedTimeline
      ? `${renderDirectorTimelineForPrompt(input.directorBrief)} ${strictReference ? "STRICT SOURCE INTERVAL PRIORITY: the matching interval is authoritative for location, environment, light, composition, camera, visible subject, speech mode, presenter-versus-B-roll distribution, and continuity. These facts override generic format, creative plan, content_adaptation, product mentions, and narration keywords. A taxi/Uber/travel mention is semantic only: if the source interval is continuous presenter/on_camera, do not create a car, vehicle interior, travel setting, environment_cutaway, or independent B-roll." : "Per-interval subject rules override global avatar, wardrobe, and speech defaults; use the timeline as visual guidance without requiring exact location or action continuity."} Current segment format fallback: ${resolveDirectorSegmentFormat(input.directorBrief)}.`
      : null,
    objectOnlyReferenceScene
      ? "VISIBLE SUBJECT: object-only macro scene; no person, hands, face, head, or avatar."
      : noPeopleReference
        ? "VISIBLE SUBJECT: only locations, objects, approved product screens, and atmospheric B-roll; no people, hands, face, head, or avatar."
      : avatarFreeReferenceScene
        ? "VISIBLE SUBJECT: no main avatar; narration is off-camera over approved independent B-roll, with incidental visible people allowed only when the reference requires them."
      : `CHARACTER: ${input.characterContract.identityLine}.`,
    referenceBrief.wardrobeLine,
    `PRODUCT: ${input.productName}. ${renderProductRole(input.plan.productRole)}`,
    input.plan.productRole !== "hidden" ? OMNI_PRODUCT_BROLL_RULE : null,
    OMNI_REFERENCE_PRODUCT_EXCLUSION_PROMPT,
    input.productVisualPassport,
    input.productPhysicalityContract && input.plan.productRole !== "hidden" && input.plan.productRole !== "digital_demo" ? input.productPhysicalityContract : null,
    layoutContract?.propPassportLine || `PROP CONTINUITY: ${props}.`,
    ...(input.continuityDirection?.promptLines || input.continuityLines || []),
    "SCENE ACTION:",
    ...input.plan.beats.map((beat) => `${beat.startSeconds.toFixed(1)}-${beat.endSeconds.toFixed(1)}s: ${beat.action}.`),
    scriptBeatGuidance || null,
    referenceBrief.actionLine,
    strictReference
      ? "CONTENT_ADAPTATION IS SEMANTIC ONLY: use it for the narrative meaning and product bridge, never to invent a location, camera setup, visible subject, B-roll shot, vehicle, prop, or action absent from the verified source interval."
      : null,
    "SPEECH:",
    "Start speaking on frame 0. Use simple natural conversational Russian. Say only the current part once. Do not repeat, skip, restart, paraphrase, continue a neighbor part, or add subtitles.",
    `${voiceoverBrollReference || avatarFreeReferenceScene ? "The off-camera narrator says" : hybridDelivery ? "The avatar or off-camera narrator says according to each storyboard frame's speech_mode" : "The avatar says"}: ${input.plan.voiceoverText}`,
    `CONTINUITY: ${strictReference ? "the verified source interval and hard reference contract are authoritative; preserve location, light, composition, camera, subject distribution, and physical state, with changes only at analyzed cuts." : "preserve only featured avatar identity, exact approved product form, and the physical state needed inside the current action. Exact reference scene continuity is not required."} ${wardrobeDirection} ${continuity}`,
    "CLEAN FRAME: no on-screen text, subtitles, captions, progress bars, overlay icons, buttons, watermarks, logos, or app interface.",
    OMNI_NO_VISIBLE_FILMING_GEAR_PROMPT,
  ].filter(Boolean).join("\n");
}

function renderProductRole(role: ProductRole) {
  if (role === "hidden") {
    return "Do not show the product in this part.";
  }
  if (role === "background_prop") {
    return "When visible, show it only as standalone product B-roll on a stable surface; no people, hands, face, body, holding, touching, pickup, or interaction.";
  }
  if (role === "brief_demo") {
    return "Show it only as standalone product B-roll on a stable surface; no people, hands, face, body, holding, touching, pickup, or interaction.";
  }
  if (role === "digital_demo") {
    return "Show only the approved product screen on a smartphone resting on a stable surface; no people, hands, face, body, holding, touching, pickup, or interaction.";
  }
  return "When visible, show it only as standalone product B-roll on a stable surface; no people, hands, face, body, holding, touching, pickup, or interaction.";
}
