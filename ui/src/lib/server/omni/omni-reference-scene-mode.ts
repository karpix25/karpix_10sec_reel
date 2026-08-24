import type { OmniCreativeStrategy } from "../../omni/creative-contract";
import {
  normalizeDirectorVisibleSubjectPolicy,
  renderVisibleSubjectPolicy,
  type DirectorVisibleSubjectPolicy,
} from "./director-visibility-policy";

export type ReferenceSceneMode = "presenter" | "voiceover_broll" | "faceless_hands" | "body_crop" | "object_only" | "animation";
export type OmniCreativeStrategyWithReferenceSceneMode = OmniCreativeStrategy & { referenceSceneMode: ReferenceSceneMode };

const VALID_MODES: readonly ReferenceSceneMode[] = ["presenter", "voiceover_broll", "faceless_hands", "body_crop", "object_only", "animation"];
const FACE_SIGNAL_PATTERN = /face[- ]?to[- ]?camera|direct eye contact|looks? into (?:the )?camera|лиц[оа]|смотрит в камеру|говорящ(?:ая|ий) голова|взгляд в объектив/iu;
const VOICEOVER_BROLL_PATTERN = /voice[- ]?over|voiceover|b[-\s]?roll|off[- ]?camera|закадр|нарезк|перебивк|independent cutaway/iu;
const OBJECT_ONLY_PATTERN = /object[- ]?only|product[- ]?only|предметн(?:ый|ая) кадр|только предмет|без человека/iu;
const BODY_CROP_PATTERN = /body[- ]?crop|torso[- ]?only|from (?:the )?shoulders? down|только корпус|по плечи вниз|без головы/iu;
const HANDS_ONLY_PATTERN = /hands?[- ]?only|handwritten|whiteboard|close[- ]?up of hands|off[- ]?camera narration|voice[- ]?over|faceless|no visible face|без лица|лицо не видно|рук(?:и|ами) крупно|закадров(?:ый|ая) голос|маркер|холодильник|refrigerator/iu;

export function normalizeReferenceSceneMode(value: unknown): ReferenceSceneMode | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/[ -]+/gu, "_");
  if (normalized === "hands_only" || normalized === "hands" || normalized === "faceless") return "faceless_hands";
  if (normalized === "broll" || normalized === "voiceover" || normalized === "voiceover_montage") return "voiceover_broll";
  if (normalized === "body") return "body_crop";
  if (normalized === "object") return "object_only";
  if (normalized === "animated" || normalized === "illustrated" || normalized === "cartoon") return "animation";
  return VALID_MODES.includes(normalized as ReferenceSceneMode) ? normalized as ReferenceSceneMode : null;
}

export function resolveReferenceSceneMode(brief: unknown): ReferenceSceneMode {
  const candidate = isRecord(brief) ? brief : null;
  const explicit = normalizeReferenceSceneMode(candidate?.reference_subject_mode ?? candidate?.referenceSceneMode ?? candidate?.reference_scene_mode ?? candidate?.referenceSubjectMode);
  const visibleSubjectPolicy = normalizeDirectorVisibleSubjectPolicy(candidate?.visible_subject_policy ?? candidate?.visibleSubjectPolicy);
  if (visibleSubjectPolicy === "hands_only") return "faceless_hands";
  if (visibleSubjectPolicy === "object_only") return "object_only";
  if (visibleSubjectPolicy === "animation") return "animation";
  if (visibleSubjectPolicy === "no_people" || visibleSubjectPolicy === "silent_avatar") {
    return "voiceover_broll";
  }
  const timelineModes = cameraTimelineModes(candidate?.camera_timeline);
  if (timelineModes.has("on_camera") && timelineModes.has("voiceover_only")) {
    return "presenter";
  }
  if (explicit && explicit !== "presenter") return explicit;
  if (!candidate) return "presenter";
  const visualHook = isRecord(candidate.visual_hook) ? candidate.visual_hook : null;
  const camera = isRecord(candidate.camera) ? candidate.camera : null;
  const actionBeats = Array.isArray(candidate.action_beats) ? candidate.action_beats : [];
  const observedText = [candidate.reference_action_style, visualHook?.action,
    ...(Array.isArray(camera?.shot_types) ? camera.shot_types : []),
    ...(Array.isArray(camera?.angles) ? camera.angles : []),
    ...actionBeats.flatMap((beat) => isRecord(beat) ? [beat.action_description, beat.actor_gesture] : []),
    ...(Array.isArray(candidate.hand_object_interactions) ? candidate.hand_object_interactions : []),
    ...(Array.isArray(candidate.prop_sources) ? candidate.prop_sources : [])]
    .filter((value): value is string => typeof value === "string").join(" ");
  const referenceFormat = String(candidate.reference_format_mode ?? candidate.referenceFormatMode ?? "");
  if (OBJECT_ONLY_PATTERN.test(observedText)) return "object_only";
  if (BODY_CROP_PATTERN.test(observedText)) return "body_crop";
  if (/voiceover_montage/iu.test(referenceFormat) &&
      VOICEOVER_BROLL_PATTERN.test(observedText) && !FACE_SIGNAL_PATTERN.test(observedText)) {
    return "voiceover_broll";
  }
  if (HANDS_ONLY_PATTERN.test(observedText) && !FACE_SIGNAL_PATTERN.test(observedText)) return "faceless_hands";
  if (explicit) return explicit;
  return "presenter";
}

function cameraTimelineModes(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set();
  return new Set(value
    .map((item) => isRecord(item) ? item.speech_mode ?? item.speechMode ?? item.delivery_mode : null)
    .filter((mode): mode is string => mode === "on_camera" || mode === "voiceover_only"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isFacelessReferenceScene(mode: ReferenceSceneMode | null | undefined) {
  return mode === "faceless_hands" || mode === "body_crop" || mode === "object_only";
}

export function isAvatarFreeReferenceScene(mode: ReferenceSceneMode | null | undefined) {
  return isFacelessReferenceScene(mode) || mode === "animation";
}

export function isObjectOnlyReferenceScene(mode: ReferenceSceneMode | null | undefined) {
  return mode === "object_only";
}

export function withReferenceSceneMode(strategy: OmniCreativeStrategy, referenceSceneMode: ReferenceSceneMode): OmniCreativeStrategyWithReferenceSceneMode {
  return { ...strategy, referenceSceneMode };
}

export function applyReferenceSceneModeToOmniPrompt(
  prompt: string,
  referenceSceneMode: ReferenceSceneMode,
  visibleSubjectPolicy: DirectorVisibleSubjectPolicy = "presenter",
) {
  if (referenceSceneMode === "animation") {
    return [prompt,
      "REFERENCE SUBJECT MODE: ANIMATION.",
      "Preserve the approved illustrated or animated style, characters, shapes, textures, camera, and edit rhythm from the storyboard.",
      "Do not add a live presenter, photorealistic avatar, talking-head framing, or live-action lip-sync.",
    ].join("\n");
  }
  if (referenceSceneMode === "voiceover_broll") {
    const filtered = prompt.split("\n")
      .map((line) => line.replace(/The avatar says:/u, "The off-camera narrator says:"))
      .join("\n");
    const avatarLine = visibleSubjectPolicy === "silent_avatar"
      ? "Use the saved avatar/character reference as the same silent visual subject in every panel; identity is fixed even when location, outfit, or action changes with the reference cut."
      : "Do not add an avatar, presenter, face, head, or hands unless the approved storyboard explicitly requires them.";
    return [filtered,
      "REFERENCE SUBJECT MODE: VOICEOVER B-ROLL.",
      renderVisibleSubjectPolicy(visibleSubjectPolicy),
      avatarLine,
      "Do not use talking-head framing, lip-sync, mouth-synced speech, or mandatory eye contact; narration stays off-camera.",
    ].join("\n");
  }
  if (!isFacelessReferenceScene(referenceSceneMode)) return prompt;
  const objectOnly = isObjectOnlyReferenceScene(referenceSceneMode);
  const filtered = prompt.split("\n")
    .filter((line) => !/^Лицо и личность персонажа|^Фиксируй те же волосы|^В каждом talking-head кадре персонаж смотрит/iu.test(line.trim()))
    .map((line) => line.replace(/^The avatar says:/u, "The off-camera narrator says:"))
    .join("\n");
  return [filtered,
    objectOnly ? "REFERENCE SUBJECT MODE: OBJECT-ONLY." : "REFERENCE SUBJECT MODE: FACELESS HANDS-ONLY.",
    objectOnly
      ? "Use off-camera narration. Never show a person, hands, face, head, eyes, lips, lip-sync portrait, talking-head framing, avatar portrait, or eye contact."
      : "Use off-camera narration. Never show a face, head, eyes, lip-sync portrait, talking-head framing, avatar portrait, or eye contact.",
    objectOnly
      ? "Show only the approved surface, product, and conceptual props. Preserve the reference camera, light, action order, and object continuity."
      : "Show only the hands and the exact body crop, surface, and physical props required by the approved storyboard. Preserve the reference camera, light, action order, and object continuity."]
    .join("\n");
}

export function renderReferenceSceneModeForDirectorPrompt(
  mode: ReferenceSceneMode,
  visibleSubjectPolicy: DirectorVisibleSubjectPolicy = "presenter",
) {
  if (mode === "animation") {
    return "VISIBLE SUBJECT: preserve the observed illustrated or animated production; never replace it with a live presenter or photorealistic avatar.";
  }
  if (mode === "voiceover_broll") {
    return `${renderVisibleSubjectPolicy(visibleSubjectPolicy)} Preserve independent cutaways and off-camera narration; match each visible subject to the corresponding reference frame.`
  }
  return isFacelessReferenceScene(mode)
    ? "VISIBLE SUBJECT: faceless hands-only reference; narration is off-camera; no face, head, eyes, avatar portrait, or talking-head framing."
    : "VISIBLE SUBJECT: presenter remains visible; preserve the existing avatar, face, wardrobe, and talking-head continuity rules.";
}

export function assertReferenceScenePromptContract(prompt: string, mode: ReferenceSceneMode) {
  if (mode === "animation") {
    const violations = [
      hasPositivePromptInstruction(prompt, /live presenter|photorealistic avatar|talking-head|live-action lip-sync/iu)
        ? "live presenter instruction"
        : "",
    ].filter(Boolean);
    if (violations.length) throw new Error(`Animation reference prompt contract failed: ${violations.join(", ")}`);
    return;
  }
  if (mode === "voiceover_broll") {
    const violations = [
      hasPositivePromptInstruction(prompt, /The avatar says:/iu) ? "avatar speech instruction" : "",
      hasPositivePromptInstruction(prompt, /говорит\s+в\s+камеру|talking-head\s+(?:кадр|framing)|lip-sync/iu) ? "talking-head instruction" : "",
    ].filter(Boolean);
    if (violations.length) {
      throw new Error(`Avatar-led B-roll prompt contract failed: ${violations.join(", ")}`);
    }
    return;
  }
  if (!isAvatarFreeReferenceScene(mode)) return;
  const violations = [
    hasPositivePromptInstruction(prompt, /The avatar says:/iu) ? "avatar speech instruction" : "",
    /avatar\/character reference: единственный человек/iu.test(prompt) ? "avatar reference instruction" : "",
    hasPositivePromptInstruction(prompt, /говорит\s+в\s+камеру|talking-head\s+(?:кадр|framing)/iu) ? "talking-head instruction" : "",
  ].filter(Boolean);
  if (violations.length) {
    throw new Error(`Avatar-free reference prompt contract failed: ${violations.join(", ")}`);
  }
}

const PROMPT_NEGATION_PATTERN = /(?<![\p{L}\p{N}])(?:do\s+not|don't|never|no|without|avoid|не|без|запрещ|не\s+показывай|не\s+добавляй|не\s+используй)(?![\p{L}\p{N}])/iu;

function hasPositivePromptInstruction(prompt: string, pattern: RegExp) {
  return prompt
    .split(/[\n.;!?]+/u)
    .some((fragment) => pattern.test(fragment) && !PROMPT_NEGATION_PATTERN.test(fragment));
}
