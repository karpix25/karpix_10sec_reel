import type { PhysicalSpeechMode } from "../../omni/physical-scene-types";

export type DirectorVisibleSubjectRole =
  | "primary_presenter"
  | "silent_primary_subject"
  | "background_person"
  | "no_people"
  | "hands_only"
  | "object_only"
  | "unknown";

export type DirectorSourceRole =
  | "hook"
  | "presenter"
  | "environment_broll"
  | "product_broll"
  | "proof_broll"
  | "transition"
  | "ending"
  | "unknown";

export function normalizeDirectorVisibleSubjectRole(value: unknown): DirectorVisibleSubjectRole | null {
  const normalized = textValue(value).toLowerCase().replace(/[ -]+/gu, "_");
  const aliases: Record<string, DirectorVisibleSubjectRole> = {
    presenter: "primary_presenter",
    main_presenter: "primary_presenter",
    speaking_presenter: "primary_presenter",
    silent_avatar: "silent_primary_subject",
    silent_subject: "silent_primary_subject",
    background: "background_person",
    background_people: "background_person",
    no_visible_subject: "no_people",
    no_people: "no_people",
    hands: "hands_only",
    object: "object_only",
  };
  return aliases[normalized] || [
    "primary_presenter",
    "silent_primary_subject",
    "background_person",
    "no_people",
    "hands_only",
    "object_only",
    "unknown",
  ].includes(normalized as DirectorVisibleSubjectRole)
    ? (aliases[normalized] || normalized) as DirectorVisibleSubjectRole
    : null;
}

export function normalizeDirectorSourceRole(value: unknown): DirectorSourceRole | null {
  const normalized = textValue(value).toLowerCase().replace(/[ -]+/gu, "_");
  const aliases: Record<string, DirectorSourceRole> = {
    broll: "environment_broll",
    environment: "environment_broll",
    product: "product_broll",
    proof: "proof_broll",
    outro: "ending",
  };
  return aliases[normalized] || [
    "hook",
    "presenter",
    "environment_broll",
    "product_broll",
    "proof_broll",
    "transition",
    "ending",
    "unknown",
  ].includes(normalized as DirectorSourceRole)
    ? (aliases[normalized] || normalized) as DirectorSourceRole
    : null;
}

export function inferDirectorVisibleSubjectRole(input: {
  speechMode: PhysicalSpeechMode;
  action: string;
}): DirectorVisibleSubjectRole {
  if (/no\s+(?:people|person)|без\s+(?:людей|человек)|nobody|no\s+one/iu.test(input.action)) return "no_people";
  if (input.speechMode === "on_camera") return "primary_presenter";
  if (/hands?|рук|ладон|body\s*crop|корпус/iu.test(input.action)) return "hands_only";
  if (/person|people|человек|люд|прохож/iu.test(input.action)) return "background_person";
  return "unknown";
}

export function inferDirectorSourceRole(input: {
  speechMode: PhysicalSpeechMode;
  action: string;
}): DirectorSourceRole {
  if (input.speechMode === "on_camera") return "presenter";
  if (/product|phone|screen|app|продукт|телефон|экран|прилож/iu.test(input.action)) return "product_broll";
  return "environment_broll";
}

export function normalizeDirectorSourceIntervalFields(
  value: Record<string, unknown>,
  speechMode: PhysicalSpeechMode,
) {
  const action = textValue(value.action_description || value.action);
  const visibleSubjectRole = normalizeDirectorVisibleSubjectRole(
    value.visible_subject_role || value.visibleSubjectRole || value.subject_role || value.subjectRole
  ) || inferDirectorVisibleSubjectRole({ speechMode, action });
  const explicitAvatarAllowed = value.avatar_allowed ?? value.avatarAllowed;
  const avatarAllowed = typeof explicitAvatarAllowed === "boolean"
    ? explicitAvatarAllowed
    : visibleSubjectRole === "primary_presenter";
  const sourceRole = normalizeDirectorSourceRole(
    value.source_role || value.sourceRole || value.visual_role || value.visualRole
  ) || inferDirectorSourceRole({ speechMode, action });
  return {
    visible_subject_role: visibleSubjectRole,
    avatar_allowed: avatarAllowed,
    source_role: sourceRole,
    visual_description: textValue(value.visual_description || value.visualDescription || value.what_is_shown),
    composition: textValue(value.composition || value.frame_composition || value.framing),
    visible_objects: stringArray(value.visible_objects || value.visibleObjects || value.objects),
    transition_in: textValue(value.transition_in || value.transitionIn),
    transition_out: textValue(value.transition_out || value.transitionOut),
    adaptation_rule: textValue(value.adaptation_rule || value.adaptationRule || value.transfer_rule),
  };
}

export function renderDirectorSubjectPolicy(input: {
  visibleSubjectRole?: DirectorVisibleSubjectRole;
  avatarAllowed?: boolean;
  speechMode?: PhysicalSpeechMode;
}) {
  if (input.avatarAllowed === false || input.visibleSubjectRole === "no_people") {
    return "SUBJECT: no presenter or avatar; use an independent B-roll frame without a featured person.";
  }
  if (input.visibleSubjectRole === "hands_only") {
    return "SUBJECT: hands or the approved body crop only; no face, head, or avatar portrait.";
  }
  if (input.visibleSubjectRole === "background_person") {
    return "SUBJECT: background person only; do not turn this person into the featured avatar.";
  }
  if (input.visibleSubjectRole === "silent_primary_subject") {
    return "SUBJECT: the saved avatar may appear as a silent visual subject; narration remains off-camera.";
  }
  if (input.speechMode === "on_camera" || input.visibleSubjectRole === "primary_presenter") {
    return "SUBJECT: the saved avatar may appear as the primary presenter and speak to camera.";
  }
  return "SUBJECT: follow the analyzed source interval; do not infer a presenter from voiceover alone.";
}

export function buildDirectorTimelineSeekSeconds(durationSeconds: number | null | undefined) {
  const duration = Number.isFinite(durationSeconds) && Number(durationSeconds) > 0
    ? Math.min(60, Number(durationSeconds))
    : 40;
  return Array.from({ length: Math.max(1, Math.ceil(duration / 2)) }, (_, index) => round(index * 2));
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(textValue).filter(Boolean).slice(0, 8)
    : [];
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
