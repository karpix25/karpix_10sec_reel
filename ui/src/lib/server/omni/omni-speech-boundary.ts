import type { VoiceSegment } from "./omni-script-segmentation";
import type { GeneratedScriptPlan } from "./script-beat-plan";
import { sanitizeOmniScriptText } from "./omni-script-text-contract";

export type SpeechBoundaryRepair = {
  changed: boolean;
  removedPhrases: string[];
};

export function repairVoiceSegmentBoundaryRepeats(
  segments: readonly VoiceSegment[]
): { segments: VoiceSegment[]; repair: SpeechBoundaryRepair; scriptText: string } {
  const repaired = segments.map((segment) => ({ ...segment }));
  const repair = repairTextsInPlace(
    repaired,
    (segment) => segment.text,
    (segment, text) => {
      segment.text = text;
      segment.wordCount = countWords(text);
    }
  );

  return {
    segments: repaired,
    repair,
    scriptText: repaired.map((segment) => segment.text).filter(Boolean).join(" "),
  };
}

export function repairScriptBeatBoundaryRepeats(
  plan: GeneratedScriptPlan | null
): { plan: GeneratedScriptPlan | null; repair: SpeechBoundaryRepair; scriptText: string } {
  if (!plan) return { plan, repair: emptyRepair(), scriptText: "" };
  const beats = plan.beats.map((beat) => ({ ...beat }));
  const repair = repairTextsInPlace(
    beats,
    (beat) => beat.voiceover,
    (beat, text) => {
      beat.voiceover = text;
    }
  );
  const repairedPlan = repair.changed ? { ...plan, beats } : plan;
  return {
    plan: repairedPlan,
    repair,
    scriptText: beats.map((beat) => beat.voiceover).filter(Boolean).join(" "),
  };
}

function repairTextsInPlace<T>(
  items: T[],
  read: (item: T) => string,
  write: (item: T, text: string) => void
) {
  const removedPhrases: string[] = [];
  for (let index = 1; index < items.length; index += 1) {
    const previous = read(items[index - 1]);
    const current = read(items[index]);
    const duplicate = findBoundaryDuplicate(previous, current);
    if (!duplicate) continue;

    const nextText = current.split(/\s+/u).slice(duplicate.tokenCount).join(" ").trim();
    if (!nextText) continue;
    write(items[index], sanitizeOmniScriptText(nextText));
    removedPhrases.push(duplicate.phrase);
  }
  return { changed: removedPhrases.length > 0, removedPhrases };
}

function findBoundaryDuplicate(previous: string, current: string) {
  const previousTokens = tokenize(previous);
  const currentTokens = tokenize(current);
  const max = Math.min(8, previousTokens.length, currentTokens.length);

  for (let count = max; count >= 2; count -= 1) {
    const previousSlice = previousTokens.slice(previousTokens.length - count);
    const currentSlice = currentTokens.slice(0, count);
    if (!sameNormalizedTokens(previousSlice, currentSlice)) continue;
    return {
      tokenCount: count,
      phrase: currentSlice.map((token) => token.raw).join(" "),
    };
  }

  return null;
}

function tokenize(text: string) {
  return text
    .split(/\s+/u)
    .map((raw) => ({ raw, normalized: normalizeToken(raw) }))
    .filter((token) => token.normalized);
}

function sameNormalizedTokens(
  left: readonly { normalized: string }[],
  right: readonly { normalized: string }[]
) {
  if (left.length !== right.length) return false;
  return left.every((token, index) => token.normalized === right[index].normalized);
}

function normalizeToken(token: string) {
  return token
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function countWords(text: string) {
  return text.split(/\s+/u).filter(Boolean).length;
}

function emptyRepair(): SpeechBoundaryRepair {
  return { changed: false, removedPhrases: [] };
}
