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
    format: "talking_head_cutaways",
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
    format: "talking_head_cutaways",
    segmentPrompts,
    notes: clean(data.notes) || null,
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
  const durationSeconds = positiveInteger(data.duration_seconds || data.durationSeconds);
  const storyboardFrames = arrayOf(data.storyboard_frames || data.storyboardFrames || data.frames, normalizeStoryboardFrame);
  const voiceover = clean(data.voiceover) || joinStoryboardSpeech(storyboardFrames);
  const shots = arrayOf(data.shots, normalizeDirectorShot);
  const compatibleShots = shots.length ? shots : deriveLegacyShots(storyboardFrames);
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

function normalizeDirectorShot(raw: unknown): DirectorShot | null {
  const data = asRecord(raw);
  if (!data) return null;
  const role = clean(data.role);
  if (role !== "face_open" && role !== "cutaway" && role !== "face_return") return null;
  const action = clean(data.action);
  return action ? { role, action } : null;
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
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
