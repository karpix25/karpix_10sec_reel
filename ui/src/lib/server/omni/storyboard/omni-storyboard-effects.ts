import type { DirectorBrief } from "../director-analysis-types";

const FILM_TRANSITION_TERMS = /film\s*(?:burn|flash)|light\s*leak|exposure\s*flash|lens\s*flare|пленочн(?:ый|ая)\s+засвет|засвет\s+пленки|вспышк/iu;

export function renderReferenceTransitionCue(brief?: DirectorBrief | null) {
  const styles = brief?.montage_rhythm.transition_style || [];
  const styleText = styles.join(", ") || "continuous stable shot";
  return `REFERENCE TRANSITION: ${styleText}; copy only visible cut effects (film burn/light leak/flash), never a camera or outfit change.`;
}

export function renderFrameTransitionNote(brief: DirectorBrief | null | undefined, frameIndex: number) {
  if (frameIndex === 1) return null;
  const styles = brief?.montage_rhythm.transition_style || [];
  const filmCue = styles.some((style) => FILM_TRANSITION_TERMS.test(style))
    ? " preserve the exact film-burn/light-leak flash visible at this cut"
    : " use the exact visible cut treatment from the corresponding reference boundary";
  return `transition from previous panel: ${styles.join(", ") || "the reference cut"};${filmCue}; never move the camera to create the transition`;
}
