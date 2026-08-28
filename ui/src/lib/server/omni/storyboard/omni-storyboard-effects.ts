import type { DirectorBrief } from "../director-analysis-types";

const FILM_TRANSITION_TERMS = /film\s*(?:burn|flash)|light\s*leak|exposure\s*flash|lens\s*flare|пленочн(?:ый|ая)\s+засвет|засвет\s+пленки|вспышк/iu;

export function renderReferenceTransitionCue(brief?: DirectorBrief | null) {
  const styles = brief?.montage_rhythm.transition_style || [];
  const styleText = styles.join(", ").replace(/\s*\/\s*/gu, "/") || "continuous stable shot";
  return `EDITING INSPIRATION: ${styleText}; use only effects that help the new storyboard. Exact source cut timing is not required.`;
}

export function renderFrameTransitionNote(brief: DirectorBrief | null | undefined, frameIndex: number) {
  if (frameIndex === 1) return null;
  const styles = brief?.montage_rhythm.transition_style || [];
  const styleText = styles.join(", ").replace(/\s*\/\s*/gu, "/");
  const filmCue = styles.some((style) => FILM_TRANSITION_TERMS.test(style))
    ? " a film-burn/light-leak flash may be used if it supports this beat"
    : " choose a clean transition for the new beat";
  return `transition from previous panel: ${styleText || "simple clean cut"};${filmCue}`;
}
