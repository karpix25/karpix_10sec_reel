export const LLM_PROMPT_CHAIN_VERSION = "llm-prompt-chain-v1";
export const OMNI_STORYBOARD_FRAMES_PER_SEGMENT = 5;
export const OMNI_STORYBOARD_WORDS_PER_FRAME_MIN = 3;
export const OMNI_STORYBOARD_WORDS_PER_FRAME_MAX = 4;

export type PromptChainAudioMood = "energetic" | "calm" | "dramatic" | "inspiring" | "playful" | "serious";

export type DirectorShotRole = "face_open" | "cutaway" | "face_return";
export type StoryboardFrameRole = "face_open" | "product_cutaway" | "environment_cutaway" | "face_return";
export type StoryboardReferenceRole = "avatar" | "product" | "none";

export type CreativeScriptDraft = {
  version: typeof LLM_PROMPT_CHAIN_VERSION;
  script: string;
  hookAngle: string | null;
  creativeNotes: string | null;
};

export type DirectorShot = {
  role: DirectorShotRole;
  action: string;
};

export type StoryboardFrame = {
  index: number;
  role: StoryboardFrameRole;
  spokenWords: string;
  visualDescription: string;
  camera: string;
  action: string;
  productState: string;
  sfx: string | null;
  referenceRole: StoryboardReferenceRole;
};

export type DirectorSegment = {
  index: number;
  durationSeconds: number;
  voiceover: string;
  storyboardFrames: StoryboardFrame[];
  /**
   * Backward compatibility for legacy prompt consumers and validators.
   * New prompt chain logic should use storyboardFrames.
   */
  shots: DirectorShot[];
  productState: string;
  endState: string;
};

export type DirectorSegmentPlan = {
  version: typeof LLM_PROMPT_CHAIN_VERSION;
  format: "talking_head_cutaways";
  title: string;
  hookOptions: string[];
  selectedHook: string;
  segments: DirectorSegment[];
  totalVoiceover: string;
  notes: string | null;
};

export type ProviderPromptSegment = {
  index: number;
  durationSeconds: number;
  voiceover: string;
  storyboardFrames: StoryboardFrame[];
  prompt: string;
  referenceRole: "avatar" | "product" | "none";
};

export type ProviderPromptPlan = {
  version: typeof LLM_PROMPT_CHAIN_VERSION;
  format: "talking_head_cutaways";
  segmentPrompts: ProviderPromptSegment[];
  notes: string | null;
};

export type PromptValidationIssue = {
  path: string;
  code: string;
  message: string;
  severity: "error" | "warning";
};

export type LlmPromptChainSnapshot = {
  version: typeof LLM_PROMPT_CHAIN_VERSION;
  creativeScriptDraft: CreativeScriptDraft;
  directorSegmentPlan: DirectorSegmentPlan;
  providerPromptPlan: ProviderPromptPlan;
  validationIssues: PromptValidationIssue[];
};

export type LlmPromptChainResult = {
  title: string;
  hookOptions: string[];
  selectedHook: string;
  script: string;
  caption: string;
  ctaKeyword: string;
  leadMagnet: string;
  backgroundAudioMood: PromptChainAudioMood;
  beats: {
    stage: string;
    visualCue: string;
    voiceover: string;
  }[];
  snapshot: LlmPromptChainSnapshot;
};
