import { sanitizeOmniScriptText } from "./omni-script-text-contract";
import { normalizeOmniWardrobeSource, type OmniWardrobeSource } from "../../omni/wardrobe-source";

export const GENERATED_SCRIPT_PLAN_VERSION = "reels-script-writer-v1";

export type GeneratedScriptBeat = {
  stage: string;
  visualCue: string;
  voiceover: string;
};

export type GeneratedScriptPlan = {
  hookOptions: string[];
  selectedHook: string;
  beats: GeneratedScriptBeat[];
};

export function normalizeGeneratedScriptPlan(raw: unknown): GeneratedScriptPlan | null {
  const source = asRecord(raw);
  if (!source) return null;

  const hookOptions = normalizeStringArray(source.hook_options ?? source.hookOptions).slice(0, 3);
  const selectedHook = clean(source.selected_hook ?? source.selectedHook ?? source.hook ?? hookOptions[0] ?? "");
  const beats = normalizeBeats(source.beats);

  if (!beats.length) return null;

  return {
    hookOptions,
    selectedHook,
    beats,
  };
}

export const normalizeGeneratedScriptBeatPlan = normalizeGeneratedScriptPlan;

export function extractGeneratedScriptPlanFromSnapshot(snapshot: unknown): GeneratedScriptPlan | null {
  const source = asRecord(snapshot);
  if (!source) return null;

  return normalizeGeneratedScriptPlan(
    source.generated_script_plan ??
      source.generatedScriptPlan ??
      source.script_plan ??
      source.scriptPlan ??
      null
  );
}

export const extractGeneratedScriptBeatPlanFromSnapshot = extractGeneratedScriptPlanFromSnapshot;

export function buildScriptTextFromBeats(beats: readonly GeneratedScriptBeat[]) {
  return beats.map((beat) => beat.voiceover).filter(Boolean).join(" ");
}

export function deriveVoiceoverScriptFromPlan(plan: GeneratedScriptPlan | null) {
  return plan ? buildScriptTextFromBeats(plan.beats) : "";
}

export const buildVoiceoverFromScriptPlan = deriveVoiceoverScriptFromPlan;

export function selectScriptBeatsForSegment(
  plan: GeneratedScriptPlan | null,
  segmentIndex: number,
  segmentCount: number
) {
  if (!plan?.beats.length) return [];
  if (segmentCount >= plan.beats.length) {
    return [plan.beats[Math.min(segmentIndex - 1, plan.beats.length - 1)]].filter(Boolean);
  }
  const start = Math.floor(((segmentIndex - 1) * plan.beats.length) / segmentCount);
  const end = Math.max(start + 1, Math.floor((segmentIndex * plan.beats.length) / segmentCount));
  return plan.beats.slice(start, Math.min(end, plan.beats.length));
}

export const getScriptBeatsForSegment = selectScriptBeatsForSegment;

export function renderScriptBeatCue(
  beats: readonly GeneratedScriptBeat[] | null | undefined,
  options: { wardrobeSource?: OmniWardrobeSource } = {}
) {
  if (!beats?.length) return "";
  const useAvatarWardrobe = normalizeOmniWardrobeSource(options.wardrobeSource) === "avatar_reference";
  const lines = beats.map((beat, index) => {
    const stage = beat.stage ? `${beat.stage}: ` : "";
    return `${index + 1}. ${stage}визуально - ${sanitizeProviderVisualCue(beat.visualCue)}`;
  });
  return [
    "СЦЕНАРНЫЕ БИТЫ ЭТОЙ ЧАСТИ:",
    ...lines,
    useAvatarWardrobe
      ? "Эти биты описывают только картинку, жесты и монтаж. Речь брать только из строки ТОЧНАЯ РЕПЛИКА. Если внутри подсказки упомянута одежда reference-видео, игнорируй её и сохраняй outfit аватара. Не добавляй субтитры или текст на экран."
      : "Эти биты описывают только картинку, жесты и монтаж. Речь брать только из строки ТОЧНАЯ РЕПЛИКА. Не добавляй субтитры или текст на экран.",
  ].join("\n");
}

export const renderScriptBeatGuidance = renderScriptBeatCue;

export function sanitizeProviderVisualCue(value: string) {
  return value
    .replace(/(?:логотип|этикетк[аиуойе]?)[^.?!;,\n]*(?:камер|центр)[^.?!;,\n]*/giu, "продукт виден естественно в сцене без акцента на логотипе")
    .replace(/(?:камер|центр)[^.?!;,\n]*(?:логотип|этикетк[аиуойе]?)[^.?!;,\n]*/giu, "продукт виден естественно в сцене без акцента на логотипе")
    .replace(/\s+/g, " ")
    .trim();
}

export function appendCtaToLastBeat(
  plan: GeneratedScriptPlan | null,
  rawScriptBeforeCta: string,
  scriptAfterCta: string
) {
  if (!plan?.beats.length || rawScriptBeforeCta.trim() === scriptAfterCta.trim()) return plan;
  const normalizedBefore = rawScriptBeforeCta.trim();
  const normalizedAfter = scriptAfterCta.trim();
  const suffix = normalizedAfter.startsWith(normalizedBefore)
    ? normalizedAfter.slice(normalizedBefore.length).trim()
    : "";
  if (!suffix) return plan;

  const beats = [...plan.beats];
  const last = beats[beats.length - 1];
  beats[beats.length - 1] = {
    ...last,
    voiceover: clean(`${last.voiceover} ${suffix}`),
  };
  return { ...plan, beats };
}

function normalizeBeats(raw: unknown) {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item, index) => {
      const source = asRecord(item);
      if (!source) return null;
      const voiceover = clean(source.voiceover ?? source.spoken_line ?? source.spokenLine ?? source.line ?? "");
      const visualCue = clean(source.visual_cue ?? source.visualCue ?? source.visual ?? "");
      if (!voiceover || !visualCue) return null;
      return {
        stage: clean(source.stage ?? source.type ?? `beat_${index + 1}`) || `beat_${index + 1}`,
        visualCue,
        voiceover,
      };
    })
    .filter((item): item is GeneratedScriptBeat => Boolean(item));
}

function normalizeStringArray(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw.map(clean).filter(Boolean);
}

function clean(raw: unknown) {
  return sanitizeOmniScriptText(String(raw || "")).trim();
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}
