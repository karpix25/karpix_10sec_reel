export const LLM_PROMPT_CHAIN_VERSION = "llm-prompt-chain-v1";

export type PromptChainAudioMood = "energetic" | "calm" | "dramatic" | "inspiring" | "playful" | "serious";

export type DirectorShotRole = "face_open" | "cutaway" | "face_return";

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

export type DirectorSegment = {
  index: number;
  durationSeconds: number;
  voiceover: string;
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
