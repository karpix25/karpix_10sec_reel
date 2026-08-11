export {
  OMNI_STORYBOARD_ALLOWED_SEGMENT_SECONDS,
  OMNI_STORYBOARD_MAX_FRAME_WORDS,
  OMNI_STORYBOARD_MIN_FRAME_WORDS,
  OMNI_STORYBOARD_SECONDS_PER_FRAME,
  getOmniStoryboardDurationForWordCount,
  getOmniStoryboardFrameCount,
  getOmniStoryboardWordRange,
  isOmniStoryboardDuration,
  type OmniStoryboardAllowedSegmentSeconds,
} from "./omni-storyboard-timing";
import type { PhysicalFramePlan } from "../physical-scene-types";

export const FIVE_FRAMES_PER_TEN_SECONDS = 5;
export const OMNI_STORYBOARD_SEGMENT_SECONDS = 10;

export type OmniStoryboardReferenceTransfer = {
  version: "reference-transfer-v2";
  productMentioned: boolean;
  productMeaningfulBeat: boolean;
  visualCue: string | null;
  decisions: {
    layout: string;
    camera: string;
    lighting: string;
    editLanguage: string;
    wardrobe: string;
    environment: string;
    presenterAction: string;
    sourceProduct: string;
    sourceProps: string;
    overlays: string;
  };
};

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
  physicalPlan?: PhysicalFramePlan | null;
  referenceTransfer?: OmniStoryboardReferenceTransfer | null;
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
