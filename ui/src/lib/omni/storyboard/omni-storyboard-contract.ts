import {
  FIVE_FRAMES_PER_TEN_SECONDS,
  OMNI_STORYBOARD_MAX_FRAME_WORDS,
  OMNI_STORYBOARD_MIN_FRAME_WORDS,
  OMNI_STORYBOARD_SEGMENT_SECONDS,
  type OmniStoryboardFrame,
  type OmniStoryboardSegment,
  type OmniStoryboardValidationResult,
} from "./omni-storyboard-types";

const REQUIRED_FRAME_FIELDS: readonly (keyof Pick<
  OmniStoryboardFrame,
  "spokenText" | "visualAction" | "camera" | "environment" | "wardrobe" | "productPlacement" | "sfxNotes"
>)[] = [
  "spokenText",
  "visualAction",
  "camera",
  "environment",
  "wardrobe",
  "productPlacement",
  "sfxNotes",
];

const MODEL_MUSIC_CUE_PATTERN =
  /(?:музык|саундтрек|трек|песня|мелод|music|soundtrack|background\s+music|bgm|song|melody)/iu;

export function normalizeOmniStoryboardSegment(input: OmniStoryboardSegment): OmniStoryboardSegment {
  return {
    segmentIndex: input.segmentIndex,
    durationSeconds: input.durationSeconds,
    voiceoverText: normalizeStoryboardDisplayText(input.voiceoverText),
    frames: input.frames.map(normalizeFrame),
  };
}

export function validateOmniStoryboardSegment(input: OmniStoryboardSegment): OmniStoryboardValidationResult {
  const normalizedSegment = normalizeOmniStoryboardSegment(input);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (normalizedSegment.durationSeconds !== OMNI_STORYBOARD_SEGMENT_SECONDS) {
    errors.push("segment_duration_must_be_10_seconds");
  }

  if (normalizedSegment.frames.length !== FIVE_FRAMES_PER_TEN_SECONDS) {
    errors.push("segment_must_have_exactly_5_storyboard_frames");
  }

  normalizedSegment.frames.forEach((frame, frameIndex) => {
    validateRequiredFrameFields(frame, frameIndex, errors);
    validateFrameSpeech(frame, frameIndex, errors);
    validateNoModelMusicCues(frame, frameIndex, errors);
  });

  const joinedFrameSpeech = normalizedSegment.frames
    .map((frame) => frame.spokenText)
    .join(" ");
  if (normalizeOmniStoryboardSpeech(joinedFrameSpeech) !== normalizeOmniStoryboardSpeech(normalizedSegment.voiceoverText)) {
    errors.push("joined_frame_speech_must_match_segment_voiceover");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    normalizedSegment,
  };
}

export function normalizeOmniStoryboardSpeech(value: string) {
  return normalizeStoryboardDisplayText(value)
    .toLowerCase()
    .replace(/ё/gu, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function countOmniStoryboardSpokenWords(value: string) {
  const normalized = normalizeOmniStoryboardSpeech(value);
  return normalized ? normalized.split(/\s+/u).length : 0;
}

function normalizeFrame(frame: OmniStoryboardFrame): OmniStoryboardFrame {
  return {
    spokenText: normalizeStoryboardDisplayText(frame.spokenText),
    visualAction: normalizeStoryboardDisplayText(frame.visualAction),
    camera: normalizeStoryboardDisplayText(frame.camera),
    environment: normalizeStoryboardDisplayText(frame.environment),
    wardrobe: normalizeStoryboardDisplayText(frame.wardrobe),
    productPlacement: normalizeStoryboardDisplayText(frame.productPlacement),
    sfxNotes: normalizeStoryboardDisplayText(frame.sfxNotes),
    effectNotes: normalizeOptionalText(frame.effectNotes),
    modelMusicNotes: normalizeOptionalText(frame.modelMusicNotes),
  };
}

function normalizeStoryboardDisplayText(value: string) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+([,.!?;:])/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizeOptionalText(value: string | null | undefined) {
  if (value == null) return null;
  const normalized = normalizeStoryboardDisplayText(value);
  return normalized || null;
}

function validateRequiredFrameFields(
  frame: OmniStoryboardFrame,
  frameIndex: number,
  errors: string[]
) {
  for (const field of REQUIRED_FRAME_FIELDS) {
    if (!frame[field]?.trim()) {
      errors.push(`frame_${frameIndex + 1}_${field}_required`);
    }
  }
}

function validateFrameSpeech(frame: OmniStoryboardFrame, frameIndex: number, errors: string[]) {
  const wordCount = countOmniStoryboardSpokenWords(frame.spokenText);
  if (wordCount < OMNI_STORYBOARD_MIN_FRAME_WORDS || wordCount > OMNI_STORYBOARD_MAX_FRAME_WORDS) {
    errors.push(`frame_${frameIndex + 1}_spoken_words_must_be_3_to_4`);
  }
}

function validateNoModelMusicCues(frame: OmniStoryboardFrame, frameIndex: number, errors: string[]) {
  const musicFields: readonly (keyof Pick<OmniStoryboardFrame, "sfxNotes" | "effectNotes" | "modelMusicNotes">)[] = [
    "sfxNotes",
    "effectNotes",
    "modelMusicNotes",
  ];

  for (const field of musicFields) {
    const value = frame[field];
    if (value && MODEL_MUSIC_CUE_PATTERN.test(value)) {
      errors.push(`frame_${frameIndex + 1}_${field}_must_not_include_music_cue`);
    }
  }
}
