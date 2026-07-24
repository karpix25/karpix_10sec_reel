export const FIVE_FRAMES_PER_TEN_SECONDS = 5;
export const OMNI_STORYBOARD_SEGMENT_SECONDS = 10;
export const OMNI_STORYBOARD_MIN_FRAME_WORDS = 3;
export const OMNI_STORYBOARD_MAX_FRAME_WORDS = 4;

export type OmniStoryboardFrame = {
  spokenText: string;
  visualAction: string;
  camera: string;
  environment: string;
  wardrobe: string;
  productPlacement: string;
  sfxNotes: string;
  effectNotes?: string | null;
  modelMusicNotes?: string | null;
};

export type OmniStoryboardSegment = {
  segmentIndex: number;
  durationSeconds: number;
  voiceoverText: string;
  frames: readonly OmniStoryboardFrame[];
};

export type OmniStoryboardValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  normalizedSegment: OmniStoryboardSegment;
};
