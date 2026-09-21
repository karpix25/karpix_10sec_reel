import type { OmniSegmentDirectorScene } from "@/lib/omni/creative-contract";
import { sanitizeOmniScriptText } from "./omni-script-text-contract";

/**
 * Bridges the script director plan (раскадровка from omni_script_director_plans)
 * into reel segment plans. The mapping is pure time-window math: director scenes
 * are assigned to the segment whose [start, end) window contains the scene
 * midpoint, so every scene lands in exactly one segment. Legacy scripts without
 * a director plan produce no patches and stay completely unaffected.
 */

const DIRECTOR_WORDS_PER_SECOND = 2.2;

export type DirectorPlanSegmentInput = {
  segment_index: number;
  voiceover_text: string | null;
  duration_seconds?: number | null;
  planned_start_sec?: number | null;
};

export type SegmentTimeWindow = {
  segment_index: number;
  start_sec: number;
  end_sec: number;
};

export type SegmentDirectorScenes = {
  segment_index: number;
  director_scenes: OmniSegmentDirectorScene[];
  /** True when any overlapping director scene wants the product on screen. */
  product_visible: boolean;
};

export type DirectorSceneSegmentPatch = {
  segment_index: number;
  director_scenes: OmniSegmentDirectorScene[];
  prompt_section: string | null;
};

/**
 * Cumulative [start, end) windows in segment_index order. Missing durations
 * derive from the voiceover word count at DIRECTOR_WORDS_PER_SECOND (rounded);
 * an explicit planned_start_sec pins the window start instead of the cursor.
 */
export function deriveSegmentTimeWindows(
  segments: readonly DirectorPlanSegmentInput[]
): SegmentTimeWindow[] {
  const ordered = [...segments].sort((left, right) => left.segment_index - right.segment_index);
  const windows: SegmentTimeWindow[] = [];
  let cursorSec = 0;
  for (const segment of ordered) {
    const startSec = typeof segment.planned_start_sec === "number" && Number.isFinite(segment.planned_start_sec)
      ? Math.max(0, segment.planned_start_sec)
      : cursorSec;
    const endSec = startSec + resolveDurationSeconds(segment);
    windows.push({ segment_index: segment.segment_index, start_sec: startSec, end_sec: endSec });
    cursorSec = endSec;
  }
  return windows;
}

/** Assigns every director scene to exactly one segment (the one holding its midpoint). */
export function mapDirectorScenesToSegments(input: {
  segments: readonly DirectorPlanSegmentInput[];
  plan: { scenes: readonly OmniSegmentDirectorScene[] };
}): SegmentDirectorScenes[] {
  const windows = deriveSegmentTimeWindows(input.segments);
  const mappingBySegmentIndex = new Map<number, SegmentDirectorScenes>(
    windows.map((window) => [
      window.segment_index,
      { segment_index: window.segment_index, director_scenes: [], product_visible: false },
    ])
  );
  for (const scene of input.plan.scenes) {
    const midpointSec = (scene.start_sec + scene.end_sec) / 2;
    const window = findOwningWindow(midpointSec, windows);
    const mapping = window ? mappingBySegmentIndex.get(window.segment_index) : null;
    if (!mapping) continue;
    mapping.director_scenes.push(scene);
    if (scene.product_visible) mapping.product_visible = true;
  }
  return windows.map((window) => mappingBySegmentIndex.get(window.segment_index)!);
}

/**
 * Renders the provider prompt section for a segment's director scenes.
 * Scene text is sanitized (no long dashes or emoji); times are relative to the
 * segment start and clamped to zero so boundary-crossing scenes stay readable.
 * speech_excerpt is intentionally excluded to avoid voiceover leaks.
 */
export function renderDirectorScenesPromptSection(input: {
  scenes: readonly OmniSegmentDirectorScene[];
  segment_start_sec: number;
}): string | null {
  const scenes = input.scenes
    .map((scene) => ({
      ...scene,
      purpose: sanitizeOmniScriptText(scene.purpose || ""),
      visual_description: sanitizeOmniScriptText(scene.visual_description || ""),
      product_action: scene.product_action ? sanitizeOmniScriptText(scene.product_action) : null,
    }))
    .filter((scene) => scene.visual_description.length > 0);
  if (!scenes.length) return null;
  return [
    "РЕЖИССЁРСКАЯ РАСКАДРОВКА ЭТОГО СЕГМЕНТА (визуальные указания режиссёрского плана сценария; время от начала сегмента):",
    ...scenes.flatMap((scene) => {
      const startSec = roundTenth(Math.max(0, scene.start_sec - input.segment_start_sec));
      const endSec = roundTenth(Math.max(0, scene.end_sec - input.segment_start_sec));
      const sceneLine = `РЕЖИССЁР: ${scene.purpose} — ${scene.visual_description} (${startSec}-${endSec} с сегмента)`;
      const productLine = scene.product_visible && scene.product_action
        ? `ДЕЙСТВИЕ С ПРОДУКТОМ: ${scene.product_action}`
        : null;
      return productLine ? [sceneLine, productLine] : [sceneLine];
    }),
  ].join("\n");
}

/**
 * Loads the director plan for a generated script (lazy import keeps the module
 * graph light) and returns per-segment patches for the reel creation seam.
 * Scripts without a director plan yield an empty list.
 */
export async function resolveDirectorSceneSegmentPatches(input: {
  scriptId: number;
  segments: readonly DirectorPlanSegmentInput[];
}): Promise<DirectorSceneSegmentPatch[]> {
  const { getScriptDirectorPlan } = await import("./omni-script-director");
  const plan = await getScriptDirectorPlan(input.scriptId);
  if (!plan?.scenes?.length) return [];
  const startBySegmentIndex = new Map(
    deriveSegmentTimeWindows(input.segments).map((window) => [window.segment_index, window.start_sec])
  );
  return mapDirectorScenesToSegments({ segments: input.segments, plan })
    .filter((mapping) => mapping.director_scenes.length)
    .map((mapping) => ({
      segment_index: mapping.segment_index,
      director_scenes: mapping.director_scenes,
      prompt_section: renderDirectorScenesPromptSection({
        scenes: mapping.director_scenes,
        segment_start_sec: startBySegmentIndex.get(mapping.segment_index) ?? 0,
      }),
    }));
}

function findOwningWindow(
  midpointSec: number,
  windows: readonly SegmentTimeWindow[]
): SegmentTimeWindow | null {
  if (!windows.length) return null;
  for (const window of windows) {
    if (midpointSec >= window.start_sec && midpointSec < window.end_sec) return window;
  }
  // A plan longer than the segment timeline clamps into the last segment
  // instead of dropping scenes; anything before the first window lands there.
  return midpointSec >= windows[windows.length - 1].end_sec ? windows[windows.length - 1] : windows[0];
}

function resolveDurationSeconds(segment: DirectorPlanSegmentInput): number {
  if (
    typeof segment.duration_seconds === "number" &&
    Number.isFinite(segment.duration_seconds) &&
    segment.duration_seconds > 0
  ) {
    return segment.duration_seconds;
  }
  const words = (segment.voiceover_text || "").trim().split(/\s+/u).filter(Boolean).length;
  return Math.round(words / DIRECTOR_WORDS_PER_SECOND);
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}
