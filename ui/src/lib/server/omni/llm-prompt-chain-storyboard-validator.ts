import {
  OMNI_STORYBOARD_FRAMES_PER_SEGMENT,
  OMNI_STORYBOARD_WORDS_PER_FRAME_MAX,
  OMNI_STORYBOARD_WORDS_PER_FRAME_MIN,
  type DirectorSegmentPlan,
  type PromptValidationIssue,
  type ProviderPromptPlan,
  type StoryboardFrame,
} from "./llm-prompt-chain-types";

const NO_OMNI_MUSIC_PATTERN =
  /без\s+музык|no\s+music|музык\p{L}*\s+не\s+(?:добавляй|генерируй|создавай)|не\s+(?:добавляй|генерируй|создавай)\s+музык/iu;

export function validateStoryboardDirectorPlan(plan: DirectorSegmentPlan): PromptValidationIssue[] {
  const issues: PromptValidationIssue[] = [];
  plan.segments.forEach((segment, segmentIndex) => {
    const path = `director.segments.${segmentIndex}.storyboardFrames`;
    validateStoryboardFrames(segment.storyboardFrames, path, issues);
    if (normalize(joinStoryboardSpeech(segment.storyboardFrames)) !== normalize(segment.voiceover)) {
      issues.push({
        path,
        code: "storyboard_voiceover_mismatch",
        message: "Director segment voiceover must equal joined storyboard spoken words.",
        severity: "error",
      });
    }
  });
  return issues;
}

export function validateStoryboardProviderPlan(plan: ProviderPromptPlan): PromptValidationIssue[] {
  const issues: PromptValidationIssue[] = [];
  plan.segmentPrompts.forEach((prompt, index) => {
    const path = `provider.segmentPrompts.${index}.storyboardFrames`;
    validateStoryboardFrames(prompt.storyboardFrames, path, issues);
    if (normalize(joinStoryboardSpeech(prompt.storyboardFrames)) !== normalize(prompt.voiceover)) {
      issues.push({
        path,
        code: "provider_storyboard_voiceover_mismatch",
        message: "Provider voiceover must equal joined storyboard spoken words.",
        severity: "error",
      });
    }
    if (!NO_OMNI_MUSIC_PATTERN.test(prompt.prompt)) {
      issues.push({
        path: `provider.segmentPrompts.${index}.prompt`,
        code: "missing_no_music_instruction",
        message: "Provider prompt must explicitly tell Omni to generate no music.",
        severity: "error",
      });
    }
  });
  return issues;
}

export function validateStoryboardProviderAlignment(
  directorPlan: DirectorSegmentPlan,
  providerPlan: ProviderPromptPlan
): PromptValidationIssue[] {
  const issues: PromptValidationIssue[] = [];
  if (directorPlan.segments.length !== providerPlan.segmentPrompts.length) {
    issues.push({
      path: "provider.segmentPrompts",
      code: "segment_count_mismatch",
      message: "Provider prompt count must match director segments.",
      severity: "error",
    });
  }
  providerPlan.segmentPrompts.forEach((prompt, index) => {
    const segment = directorPlan.segments[index];
    if (!segment) return;
    if (normalize(prompt.voiceover) !== normalize(segment.voiceover)) {
      issues.push({
        path: `provider.segmentPrompts.${index}.voiceover`,
        code: "voiceover_mismatch",
        message: "Provider voiceover must match director voiceover.",
        severity: "error",
      });
    }
    if (normalize(joinStoryboardSpeech(prompt.storyboardFrames)) !== normalize(joinStoryboardSpeech(segment.storyboardFrames))) {
      issues.push({
        path: `provider.segmentPrompts.${index}.storyboardFrames`,
        code: "provider_storyboard_speech_mismatch",
        message: "Provider storyboard spoken words must match director storyboard spoken words.",
        severity: "error",
      });
    }
  });
  return issues;
}

function validateStoryboardFrames(
  frames: readonly StoryboardFrame[],
  path: string,
  issues: PromptValidationIssue[]
) {
  if (frames.length !== OMNI_STORYBOARD_FRAMES_PER_SEGMENT) {
    issues.push({
      path,
      code: "storyboard_frame_count",
      message: "Each ten second Omni segment must include exactly five storyboard frames.",
      severity: "error",
    });
    return;
  }
  if (frames[0]?.role !== "face_open") {
    issues.push({
      path: `${path}.0.role`,
      code: "storyboard_opening_role",
      message: "Storyboard must start with a face_open frame.",
      severity: "error",
    });
  }
  if (frames[frames.length - 1]?.role !== "face_return") {
    issues.push({
      path: `${path}.${frames.length - 1}.role`,
      code: "storyboard_closing_role",
      message: "Storyboard must end with a face_return frame.",
      severity: "error",
    });
  }
  if (!frames.slice(1, -1).some((frame) => frame.role === "product_cutaway" || frame.role === "environment_cutaway")) {
    issues.push({
      path,
      code: "storyboard_missing_cutaway",
      message: "Storyboard must include a middle product or environment cutaway.",
      severity: "error",
    });
  }
  frames.forEach((frame, frameIndex) => {
    const wordCount = countWords(frame.spokenWords);
    if (wordCount < OMNI_STORYBOARD_WORDS_PER_FRAME_MIN || wordCount > OMNI_STORYBOARD_WORDS_PER_FRAME_MAX) {
      issues.push({
        path: `${path}.${frameIndex}.spokenWords`,
        code: "storyboard_spoken_word_count",
        message: "Each storyboard frame must contain three or four final spoken Russian words.",
        severity: "error",
      });
    }
    if (!frame.visualDescription || !frame.camera || !frame.action || !frame.productState) {
      issues.push({
        path: `${path}.${frameIndex}`,
        code: "storyboard_frame_detail_missing",
        message: "Each storyboard frame must include visualDescription, camera, action, and productState.",
        severity: "error",
      });
    }
    if (frame.sfx && /музык|music|jingle|джингл/iu.test(frame.sfx) && !/без\s+музык|no\s+music/iu.test(frame.sfx)) {
      issues.push({
        path: `${path}.${frameIndex}.sfx`,
        code: "storyboard_music_sfx",
        message: "Storyboard SFX must be natural sound only, with no music.",
        severity: "error",
      });
    }
  });
}

function joinStoryboardSpeech(frames: readonly StoryboardFrame[]) {
  return frames.map((frame) => frame.spokenWords).filter(Boolean).join(" ");
}

function countWords(text: string) {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}

function normalize(text: string) {
  return text.toLowerCase().replace(/ё/g, "е").replace(/\s+/gu, " ").trim();
}
