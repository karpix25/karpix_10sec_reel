import {
  LLM_PROMPT_CHAIN_VERSION,
  type CreativeScriptDraft,
  type DirectorSegment,
  type DirectorSegmentPlan,
  type DirectorShot,
  type ProviderPromptPlan,
  type ProviderPromptSegment,
  type StoryboardFrame,
  type StoryboardFrameRole,
  type StoryboardReferenceRole,
} from "./llm-prompt-chain-types";
import {
  getOmniStoryboardDurationForWordCount,
  getOmniStoryboardFrameCount,
} from "../../omni/storyboard/omni-storyboard-timing";

export function normalizeCreativeScriptDraft(raw: unknown): CreativeScriptDraft | null {
  const script = typeof raw === "string" ? clean(raw) : clean(asRecord(raw)?.script);
  if (!script) return null;
  const data = asRecord(raw);
  return {
    version: LLM_PROMPT_CHAIN_VERSION,
    script,
    hookAngle: clean(data?.hook_angle || data?.hookAngle) || null,
    creativeNotes: clean(data?.creative_notes || data?.creativeNotes) || null,
  };
}

export function normalizeDirectorSegmentPlan(raw: unknown): DirectorSegmentPlan | null {
  const data = asRecord(raw);
  if (!data) return null;
  const segments = arrayOf(data.segments, normalizeDirectorSegment);
  const totalVoiceover = clean(data.total_voiceover || data.totalVoiceover) || joinVoiceovers(segments);
  if (!segments.length || !totalVoiceover) return null;
  return {
    version: LLM_PROMPT_CHAIN_VERSION,
    format: normalizePlanFormat(data.format),
    title: clean(data.title) || "Новый сценарий",
    hookOptions: arrayOfStrings(data.hook_options || data.hookOptions),
    selectedHook: clean(data.selected_hook || data.selectedHook || data.hook) || firstSentence(totalVoiceover),
    segments,
    totalVoiceover,
    notes: clean(data.notes) || null,
  };
}

export function normalizeProviderPromptPlan(raw: unknown): ProviderPromptPlan | null {
  const data = asRecord(raw);
  if (!data) return null;
  const rawSegments = data.segment_prompts || data.segmentPrompts || data.prompts;
  const segmentPrompts = arrayOf(rawSegments, normalizeProviderPromptSegment);
  if (!segmentPrompts.length) return null;
  return {
    version: LLM_PROMPT_CHAIN_VERSION,
    format: normalizePlanFormat(data.format),
    segmentPrompts,
    notes: clean(data.notes) || null,
  };
}

export function lockDirectorPlanSpeech(
  plan: DirectorSegmentPlan,
  canonicalSegments: readonly { text: string }[],
  durations: readonly number[],
  format: DirectorSegmentPlan["format"]
): DirectorSegmentPlan {
  if (plan.segments.length !== canonicalSegments.length || durations.length !== canonicalSegments.length) {
    throw new Error("Director plan segment count does not match the approved script plan");
  }
  const sourceByIndex = new Map(plan.segments.map((segment) => [segment.index, segment]));
  if (sourceByIndex.size !== plan.segments.length) {
    throw new Error("Director plan contains duplicate segment indexes");
  }
  const segments = canonicalSegments.map((canonical, index) => {
    const source = sourceByIndex.get(index + 1);
    const durationSeconds = durations[index];
    if (!source || !durationSeconds) throw new Error("Director plan is missing an approved segment");
    const storyboardFrames = repairStoryboardFrames(source.storyboardFrames, canonical.text, durationSeconds);
    return {
      ...source,
      index: index + 1,
      durationSeconds,
      voiceover: canonical.text,
      storyboardFrames,
      shots: deriveLegacyShots(storyboardFrames),
    };
  });
  return {
    ...plan,
    format,
    segments,
    totalVoiceover: joinVoiceovers(segments),
    selectedHook: firstSentence(segments[0]?.voiceover || ""),
  };
}

export function buildProviderPromptPlanFromDirector(directorPlan: DirectorSegmentPlan): ProviderPromptPlan {
  return {
    version: LLM_PROMPT_CHAIN_VERSION,
    format: directorPlan.format,
    segmentPrompts: directorPlan.segments.map((segment) => ({
      index: segment.index,
      durationSeconds: segment.durationSeconds,
      voiceover: segment.voiceover,
      storyboardFrames: segment.storyboardFrames,
      prompt: directorPlan.format === "voiceover_broll"
        ? "Используй раскадровку как источник сцен. Диктор читает только реплики из раскадровки за кадром. Не показывай панели раскадровки. Только естественные звуки, без музыки."
        : "Используй раскадровку как источник сцен. Персонаж читает только реплики из раскадровки. Не показывай панели раскадровки. Только естественные звуки, без музыки.",
      referenceRole: segment.storyboardFrames.some((frame) => frame.referenceRole === "product")
        ? "product"
        : segment.storyboardFrames.some((frame) => frame.referenceRole === "avatar")
          ? "avatar"
          : "none",
    })),
    notes: null,
  };
}

export function extractProviderPromptPlanFromSnapshot(snapshot: unknown): ProviderPromptPlan | null {
  const data = asRecord(snapshot);
  if (!data) return null;
  const chain = asRecord(data.llm_prompt_chain || data.prompt_chain);
  const rawPlan = chain?.providerPromptPlan || chain?.provider_prompt_plan || data.provider_prompt_plan;
  return normalizeProviderPromptPlan(rawPlan);
}

export function extractDirectorSegmentPlanFromSnapshot(snapshot: unknown): DirectorSegmentPlan | null {
  const data = asRecord(snapshot);
  if (!data) return null;
  const chain = asRecord(data.llm_prompt_chain || data.prompt_chain);
  const rawPlan = chain?.directorSegmentPlan || chain?.director_segment_plan || data.director_segment_plan;
  return normalizeDirectorSegmentPlan(rawPlan);
}

function normalizeDirectorSegment(raw: unknown): DirectorSegment | null {
  const data = asRecord(raw);
  if (!data) return null;
  const index = positiveInteger(data.index);
  const rawDurationSeconds = positiveInteger(data.duration_seconds || data.durationSeconds);
  const rawStoryboardFrames = arrayOf(data.storyboard_frames || data.storyboardFrames || data.frames, normalizeStoryboardFrame);
  const rawVoiceover = clean(data.voiceover) || joinStoryboardSpeech(rawStoryboardFrames);
  const durationSeconds = getOmniStoryboardDurationForWordCount(countWords(rawVoiceover)) || rawDurationSeconds;
  const storyboardFrames = repairStoryboardFrames(rawStoryboardFrames, rawVoiceover, durationSeconds);
  const voiceover = joinStoryboardSpeech(storyboardFrames) || rawVoiceover;
  const compatibleShots = deriveLegacyShots(storyboardFrames);
  if (!index || !durationSeconds || !voiceover || (!storyboardFrames.length && !compatibleShots.length)) return null;
  return {
    index,
    durationSeconds,
    voiceover,
    storyboardFrames,
    shots: compatibleShots,
    productState: clean(data.product_state || data.productState),
    endState: clean(data.end_state || data.endState),
  };
}

function normalizeProviderPromptSegment(raw: unknown): ProviderPromptSegment | null {
  const data = asRecord(raw);
  if (!data) return null;
  const index = positiveInteger(data.index);
  const durationSeconds = positiveInteger(data.duration_seconds || data.durationSeconds);
  const storyboardFrames = arrayOf(data.storyboard_frames || data.storyboardFrames || data.frames, normalizeStoryboardFrame);
  const voiceover = clean(data.voiceover) || joinStoryboardSpeech(storyboardFrames);
  const prompt = clean(data.prompt);
  if (!index || !durationSeconds || !voiceover || !prompt) return null;
  const referenceRole = clean(data.reference_role || data.referenceRole);
  return {
    index,
    durationSeconds,
    voiceover,
    storyboardFrames,
    prompt,
    referenceRole: referenceRole === "product" || referenceRole === "none" ? referenceRole : "avatar",
  };
}

function normalizeStoryboardFrame(raw: unknown): StoryboardFrame | null {
  const data = asRecord(raw);
  if (!data) return null;
  const index = positiveInteger(data.index);
  const role = normalizeStoryboardRole(data.role);
  const spokenWords = clean(data.spoken_words || data.spokenWords || data.speech || data.voiceover);
  const visualDescription = clean(data.visual_description || data.visualDescription || data.visual);
  const camera = clean(data.camera);
  const action = clean(data.action);
  const productState = clean(data.product_state || data.productState);
  const referenceRole = normalizeStoryboardReferenceRole(data.reference_role || data.referenceRole);
  if (!index || !role || !spokenWords || !visualDescription || !camera || !action) return null;
  return {
    index,
    role,
    spokenWords,
    visualDescription,
    camera,
    action,
    productState,
    sfx: clean(data.sfx || data.sound_effects || data.soundEffects) || null,
    referenceRole,
  };
}

function normalizeStoryboardRole(value: unknown): StoryboardFrameRole | null {
  const role = clean(value);
  if (role === "face_open" || role === "product_cutaway" || role === "environment_cutaway" || role === "face_return") {
    return role;
  }
  if (role === "cutaway") return "product_cutaway";
  return null;
}

function normalizeStoryboardReferenceRole(value: unknown): StoryboardReferenceRole {
  const role = clean(value);
  return role === "product" || role === "none" ? role : "avatar";
}

function normalizePlanFormat(value: unknown): DirectorSegmentPlan["format"] {
  return clean(value) === "voiceover_broll" ? "voiceover_broll" : "talking_head_cutaways";
}

function deriveLegacyShots(frames: readonly StoryboardFrame[]): DirectorShot[] {
  if (!frames.length) return [];
  const firstFace = frames.find((frame) => frame.role === "face_open") || frames[0];
  const cutaway = frames.find((frame) => frame.role === "product_cutaway" || frame.role === "environment_cutaway");
  const lastFace = [...frames].reverse().find((frame) => frame.role === "face_return") || frames[frames.length - 1];
  return [
    { role: "face_open", action: firstFace.action || firstFace.visualDescription },
    { role: "cutaway", action: cutaway?.action || cutaway?.visualDescription || firstFace.visualDescription },
    { role: "face_return", action: lastFace.action || lastFace.visualDescription },
  ];
}

function repairStoryboardFrames(
  frames: readonly StoryboardFrame[],
  voiceover: string,
  durationSeconds: number
): StoryboardFrame[] {
  const expectedFrameCount = getOmniStoryboardFrameCount(durationSeconds);
  if (!expectedFrameCount || !voiceover || !frames.length) return [...frames];
  const fittedFrames = Array.from({ length: expectedFrameCount }, (_, index) => {
    const sourceIndex = expectedFrameCount === 1
      ? 0
      : Math.round(index * (frames.length - 1) / (expectedFrameCount - 1));
    return frames[sourceIndex];
  });
  const words = voiceover.split(/\s+/u).filter(Boolean);
  const chunks = splitWords(words, expectedFrameCount);
  if (!chunks.length) return [...frames];
  return chunks.map((spokenWords, index) => {
    const source = fittedFrames[index];
    return {
      ...source,
      index: index + 1,
      spokenWords,
      productState: source.productState || "продукт вне кадра",
    };
  });
}

function splitWords(words: readonly string[], frameCount: number) {
  if (!words.length || frameCount < 1) return [] as string[];
  const chunks: string[] = [];
  let offset = 0;
  for (let index = 0; index < frameCount; index += 1) {
    const remainingWords = words.length - offset;
    const remainingFrames = frameCount - index;
    const count = Math.ceil(remainingWords / remainingFrames);
    chunks.push(words.slice(offset, offset + count).join(" "));
    offset += count;
  }
  return chunks;
}

function countWords(text: string) {
  return text.split(/\s+/u).filter(Boolean).length;
}

function joinStoryboardSpeech(frames: readonly StoryboardFrame[]) {
  return frames.map((frame) => frame.spokenWords).filter(Boolean).join(" ");
}

function joinVoiceovers(segments: readonly { voiceover: string }[]) {
  return segments.map((segment) => segment.voiceover).filter(Boolean).join(" ");
}

function firstSentence(text: string) {
  return text.split(/(?<=[.!?])\s+/u)[0]?.trim() || text.split(/\s+/u).slice(0, 8).join(" ");
}

function arrayOf<T>(value: unknown, normalize: (item: unknown) => T | null): T[] {
  return Array.isArray(value) ? value.map(normalize).filter((item): item is T => Boolean(item)) : [];
}

function arrayOfStrings(value: unknown) {
  return Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
}

function positiveInteger(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function clean(value: unknown) {
  return typeof value === "string"
    ? value.replace(/[\-‐‑‒–—―−]/gu, " ").replace(/\s+/gu, " ").trim()
    : "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
