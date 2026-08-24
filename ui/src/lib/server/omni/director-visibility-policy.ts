export type DirectorVisibleSubjectPolicy =
  | "presenter"
  | "silent_avatar"
  | "no_people"
  | "hands_only"
  | "object_only"
  | "animation";

const POLICIES: readonly DirectorVisibleSubjectPolicy[] = [
  "presenter",
  "silent_avatar",
  "no_people",
  "hands_only",
  "object_only",
  "animation",
];

export function normalizeDirectorVisibleSubjectPolicy(value: unknown): DirectorVisibleSubjectPolicy | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().split(" ").join("_").split("-").join("_");
  return POLICIES.includes(normalized as DirectorVisibleSubjectPolicy)
    ? normalized as DirectorVisibleSubjectPolicy
    : null;
}

export function resolveDirectorVisibleSubjectPolicy(brief: {
  visible_subject_policy?: DirectorVisibleSubjectPolicy | null;
  reference_subject_mode?: string | null;
} | null | undefined): DirectorVisibleSubjectPolicy {
  const explicit = normalizeDirectorVisibleSubjectPolicy(brief?.visible_subject_policy);
  if (explicit && explicit !== "presenter") return explicit;
  if (brief?.reference_subject_mode === "faceless_hands") return "hands_only";
  if (brief?.reference_subject_mode === "object_only") return "object_only";
  if (brief?.reference_subject_mode === "voiceover_broll") return "silent_avatar";
  return explicit || "presenter";
}

export function isAvatarFreeVisibleSubjectPolicy(policy: DirectorVisibleSubjectPolicy) {
  return policy === "no_people" || policy === "hands_only" || policy === "object_only" || policy === "animation";
}

export function renderVisibleSubjectPolicy(policy: DirectorVisibleSubjectPolicy) {
  switch (policy) {
    case "no_people":
      return "VISIBLE SUBJECT POLICY: no people, no avatar, no hands, no face; use only locations, objects, approved product screens, and atmospheric B-roll. Narration is off-camera.";
    case "silent_avatar":
      return "VISIBLE SUBJECT POLICY: the saved avatar may appear as a silent visual subject, but never speaks or lip-syncs; narration is off-camera.";
    case "hands_only":
      return "VISIBLE SUBJECT POLICY: show only the approved hands or body crop; no face, head, eyes, avatar portrait, or talking-head framing.";
    case "object_only":
      return "VISIBLE SUBJECT POLICY: show only the approved object, surface, product screen, and conceptual props; no people, hands, face, head, or avatar.";
    case "animation":
      return "VISIBLE SUBJECT POLICY: preserve the observed animated or illustrated production; do not replace it with a live presenter.";
    default:
      return "VISIBLE SUBJECT POLICY: the presenter remains visible; preserve the observed face-to-camera delivery when the reference uses it.";
  }
}
