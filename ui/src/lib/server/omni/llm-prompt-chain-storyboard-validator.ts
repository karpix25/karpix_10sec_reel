import {
  OMNI_STORYBOARD_WORDS_PER_FRAME_MIN,
  type DirectorSegmentPlan,
  type PromptValidationIssue,
  type ProviderPromptPlan,
  type StoryboardFrame,
} from "./llm-prompt-chain-types";
import { mentionsOmniProduct } from "./omni-intro-product-contract";
import {
  isReferenceBrollSource,
  isReferencePresenterSource,
  allowsTalkingAvatarIntro,
  resolveReferenceSegmentBeatForFrame,
  type ReferenceSegmentBeat,
  type ReferenceSegmentPlan,
} from "./reference-segment-plan";
import {
  getOmniStoryboardFrameWordCounts,
  getOmniStoryboardFrameCount,
  isOmniStoryboardDuration,
} from "../../omni/storyboard/omni-storyboard-timing";

const NO_OMNI_MUSIC_PATTERN =
  /без\s+музык|no\s+music|музык\p{L}*\s+не\s+(?:добавляй|генерируй|создавай)|не\s+(?:добавляй|генерируй|создавай)\s+музык/iu;
const HIDDEN_PRODUCT_PATTERN =
  /вне\s+кадра|не\s+виден|скрыт|hidden|off\s*camera|not\s+visible/iu;
const PRODUCT_IN_HAND_PATTERN =
  /(?:продукт|товар|коллаген|банка|упаковк\p{L}*|флакон|тюбик|средств\p{L}*)[^.!?;\n]{0,80}(?:в\s+(?:одной|правой|левой)?\s*руке|держит|holding|holds?)|(?:в\s+(?:одной|правой|левой)?\s*руке|держит|holding|holds?)[^.!?;\n]{0,80}(?:продукт|товар|коллаген|банка|упаковк\p{L}*|флакон|тюбик|средств\p{L}*)/iu;
const BOTH_HANDS_ON_FACE_PATTERN =
  /(?:обе(?:ими|и)?\s+рук\p{L}*|двумя\s+рук\p{L}*|both\s+hands)[^.!?\n]{0,100}(?:лиц\p{L}*|щек\p{L}*|кож\p{L}*)|(?:лиц\p{L}*|щек\p{L}*|кож\p{L}*)[^.!?\n]{0,100}(?:обе(?:ими|и)?\s+рук\p{L}*|двумя\s+рук\p{L}*|both\s+hands)/iu;
const CUTAWAY_FACE_PATTERN =
  /смотрит\s+в\s+камеру|говорит\s+в\s+камеру|лиц[оа]\s+в\s+камер|face\s*[- ]?to\s*[- ]?camera|look(?:s|ing)?\s+(?:straight\s+)?(?:into|at)\s+the\s+camera/iu;
const STORYBOARD_FRAME_ROLES: ReadonlySet<string> = new Set([
  "face_open",
  "product_cutaway",
  "environment_cutaway",
  "face_return",
]);
const NO_FACE_PATTERN = /(?:без\s+(?:лица|лиц)|no\s+(?:face|head)|hands?\s+only|только\s+руки)/iu;
const FACE_PATTERN = /(?:\b(?:лицо|лицом|лица|портрет|аватар|голов\p{L}*|head|avatar)\b|лиц[оа]\s+(?:крупн\p{L}*|в\s+камеру)|(?:human|person(?:'s)?|close[- ]up\s+of)\s+face|говорит\s+в\s+камеру|смотрит\s+в\s+камеру|face\s*[- ]?to\s*[- ]?camera|talking\s+head|on[- ]camera)/iu;
const PRESENTER_PATTERN = /(?:\b(?:ведущ\p{L}*|презентер|presenter|аватар|avatar)\b|говорит\s+в\s+камеру|смотрит\s+в\s+камеру|face\s*[- ]?to\s*[- ]?camera|talking\s+head|on[- ]camera)/iu;
const PRODUCT_INTENT_PATTERN = /(?:продукт|товар|сервис|услуг\p{L}*|приложени\p{L}*|карт\p{L}*|оплат\p{L}*|покуп\p{L}*|использу\p{L}*|держу|нанос\p{L}*|принима\p{L}*|показыва\p{L}*|средств\p{L}*|баноч\p{L}*|упаковк\p{L}*|флакон|тюбик|коллаген|витамин|крем|сыворотк\p{L}*)/iu;
const PRODUCT_SOURCE_ROLES = new Set(["product_broll"]);

export type StoryboardReferenceValidationOptions = {
  referenceSegmentPlan?: ReferenceSegmentPlan | null;
  referenceSegmentPlans?: readonly ReferenceSegmentPlan[];
  productName?: string | null;
};

export function validateStoryboardDirectorPlan(
  plan: DirectorSegmentPlan,
  options: StoryboardReferenceValidationOptions = {}
): PromptValidationIssue[] {
  const issues: PromptValidationIssue[] = [];
  if (normalize(plan.segments.map((segment) => segment.voiceover).join(" ")) !== normalize(plan.totalVoiceover)) {
    issues.push({
      path: "director.totalVoiceover",
      code: "director_total_voiceover_mismatch",
      message: "Director totalVoiceover must exactly equal all joined segment voiceovers.",
      severity: "error",
    });
  }
  plan.segments.forEach((segment, segmentIndex) => {
    const path = `director.segments.${segmentIndex}.storyboardFrames`;
    validateStoryboardFrames(segment.storyboardFrames, segment.durationSeconds, path, issues, segment.index, options);
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

export function validateStoryboardProviderPlan(
  plan: ProviderPromptPlan,
  options: StoryboardReferenceValidationOptions = {}
): PromptValidationIssue[] {
  const issues: PromptValidationIssue[] = [];
  plan.segmentPrompts.forEach((prompt, index) => {
    const path = `provider.segmentPrompts.${index}.storyboardFrames`;
    validateStoryboardFrames(prompt.storyboardFrames, prompt.durationSeconds, path, issues, prompt.index, options);
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
  durationSeconds: number,
  path: string,
  issues: PromptValidationIssue[],
  segmentIndex: number,
  options: StoryboardReferenceValidationOptions,
) {
  const expectedFrameCount = getOmniStoryboardFrameCount(durationSeconds);
  if (!isOmniStoryboardDuration(durationSeconds)) {
    issues.push({
      path,
      code: "storyboard_duration",
      message: "Omni storyboard duration must be 4, 6, 8, or 10 seconds.",
      severity: "error",
    });
    return;
  }
  if (expectedFrameCount && frames.length !== expectedFrameCount) {
    issues.push({
      path,
      code: "storyboard_frame_count",
      message: `Omni segment with ${durationSeconds} seconds must include exactly ${expectedFrameCount} storyboard frames.`,
      severity: "error",
    });
    return;
  }
  const expectedWordCounts = getOmniStoryboardFrameWordCounts(
    countWords(frames.map((frame) => frame.spokenWords).join(" ")),
    durationSeconds
  );
  frames.forEach((frame, frameIndex) => {
    if (!STORYBOARD_FRAME_ROLES.has(frame.role)) {
      issues.push({
        path: `${path}.${frameIndex}.role`,
        code: "storyboard_invalid_role",
        message: "Storyboard frame role is not supported.",
        severity: "error",
      });
    }
    const wordCount = countWords(frame.spokenWords);
    const expectedWordCount = expectedWordCounts?.[frameIndex] || OMNI_STORYBOARD_WORDS_PER_FRAME_MIN;
    if (wordCount !== expectedWordCount) {
      issues.push({
        path: `${path}.${frameIndex}.spokenWords`,
        code: "storyboard_spoken_word_count",
        message: `Storyboard frame must contain exactly ${expectedWordCount} final spoken Russian words according to the approved timing plan.`,
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
    if (frame.role === "product_cutaway" && HIDDEN_PRODUCT_PATTERN.test(frame.productState || "")) {
      issues.push({
        path: `${path}.${frameIndex}.productState`,
        code: "storyboard_product_cutaway_product_hidden",
        message: "Product cutaway frames must keep the product physically visible.",
        severity: "error",
      });
    }
    if (frame.role.endsWith("_cutaway") && CUTAWAY_FACE_PATTERN.test(`${frame.visualDescription} ${frame.camera} ${frame.action}`)) {
      issues.push({
        path: `${path}.${frameIndex}`,
        code: "cutaway_faces_camera",
        message: "Cutaway frames cannot show the presenter facing camera.",
        severity: "error",
      });
    }
    if (hasPhysicalHandObjectConflict(`${frame.visualDescription} ${frame.action} ${frame.productState}`)) {
      issues.push({
        path: `${path}.${frameIndex}`,
        code: "storyboard_hand_object_conflict",
        message: "A product held in a hand cannot be shown while both hands touch the face.",
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
    const referencePlan = resolveReferenceSegmentPlan(options, segmentIndex);
    if (referencePlan) {
      issues.push(...validateStoryboardFrameSourceInterval({
        frame,
        frameIndex,
        frameCount: frames.length,
        path: `${path}.${frameIndex}`,
        plan: referencePlan,
        productName: options.productName,
      }));
    }
  });
}

export function validateStoryboardFrameSourceInterval(input: {
  frame: StoryboardFrame;
  frameIndex: number;
  frameCount: number;
  path: string;
  plan: ReferenceSegmentPlan;
  productName?: string | null;
  productVisible?: boolean;
}): PromptValidationIssue[] {
  const beat = resolveReferenceSegmentBeatForFrame(input.plan, input.frameIndex + 1, input.frameCount);
  if (!beat) return [];

  const issues: PromptValidationIssue[] = [];
  const frameText = [input.frame.visualDescription, input.frame.camera, input.frame.action].join(" ");
  const interval = `${beat.sourceStartSeconds}-${beat.sourceEndSeconds}s source interval`;
  const avatarIntro = input.productVisible !== true && allowsTalkingAvatarIntro(input.plan, input.frameIndex) &&
    input.frame.role === "face_open" && HIDDEN_PRODUCT_PATTERN.test(input.frame.productState);
  if (isPresenterSource(beat) && input.frame.role === "environment_cutaway") {
    issues.push({
      path: `${input.path}.role`,
      code: "storyboard_source_presenter_environment_cutaway",
      message: `${interval} is presenter/on_camera, but this stored frame is environment_cutaway. Keep the source presenter/face policy for this interval; repair the frame role and visual action.`,
      severity: "error",
    });
  }
  if (!avatarIntro && beat.avatarAllowed === false && hasFace(input.frame)) {
    issues.push({
      path: input.path,
      code: "storyboard_source_avatar_forbidden_face",
      message: `${interval} has avatar_allowed=false, but this stored frame describes a face or presenter. Repair it to the approved non-face B-roll subject.`,
      severity: "error",
    });
  }
  if (!avatarIntro && isBrollSource(beat) && isPresenterFrame(input.frame)) {
    issues.push({
      path: input.path,
      code: "storyboard_source_broll_presenter",
      message: `${interval} is source B-roll/voiceover-only, but this stored frame becomes a presenter shot. Repair it to the source B-roll subject and delivery mode.`,
      severity: "error",
    });
  }
  if (input.frame.role === "product_cutaway" && !hasProductIntent(input.frame, beat, input.productName, input.productVisible)) {
    issues.push({
      path: `${input.path}.role`,
      code: "storyboard_product_cutaway_without_product_intent",
      message: `${interval} has no product intent in the stored frame or source beat, but the frame is product_cutaway. Repair it to an environment cutaway or add only an explicitly product-led frame.`,
      severity: "error",
    });
  }
  return issues;

  function hasFace(frame: StoryboardFrame) {
    if (frame.role === "face_open" || frame.role === "face_return") return true;
    return !NO_FACE_PATTERN.test(frameText) && FACE_PATTERN.test(frameText);
  }
}

function resolveReferenceSegmentPlan(
  options: StoryboardReferenceValidationOptions,
  segmentIndex: number,
) {
  return options.referenceSegmentPlans?.find((plan) => plan.segmentIndex === segmentIndex) ||
    (options.referenceSegmentPlan?.segmentIndex === segmentIndex ? options.referenceSegmentPlan : null);
}

function isPresenterSource(beat: ReferenceSegmentBeat) {
  return isReferencePresenterSource(beat);
}

function isBrollSource(beat: ReferenceSegmentBeat) {
  return isReferenceBrollSource(beat);
}

function isPresenterFrame(frame: StoryboardFrame) {
  if (frame.role === "face_open" || frame.role === "face_return") return true;
  const text = [frame.visualDescription, frame.camera, frame.action].join(" ");
  return !NO_FACE_PATTERN.test(text) && PRESENTER_PATTERN.test(text);
}

function hasProductIntent(
  frame: StoryboardFrame,
  beat: ReferenceSegmentBeat,
  productName?: string | null,
  productVisible = false,
) {
  if (productVisible) return true;
  if (frame.referenceRole === "product" || beat.sourceRole && PRODUCT_SOURCE_ROLES.has(beat.sourceRole)) return true;
  const spokenWords = frame.spokenWords || "";
  return mentionsOmniProduct(spokenWords, productName || "") || PRODUCT_INTENT_PATTERN.test(spokenWords);
}

function hasPhysicalHandObjectConflict(text: string) {
  return PRODUCT_IN_HAND_PATTERN.test(text) && BOTH_HANDS_ON_FACE_PATTERN.test(text);
}

function joinStoryboardSpeech(frames: readonly StoryboardFrame[]) {
  return frames.map((frame) => frame.spokenWords).filter(Boolean).join(" ");
}

function countWords(text: string) {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}

function normalize(text: string) {
  return text.toLowerCase().replace(/\s+/gu, " ").trim();
}
