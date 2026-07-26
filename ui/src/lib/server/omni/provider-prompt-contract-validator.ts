import type {
  DirectorSegment,
  DirectorSegmentPlan,
  DirectorShot,
  PromptValidationIssue,
  ProviderPromptPlan,
  ProviderPromptSegment,
} from "./llm-prompt-chain-types";

const DASH_PATTERN = /[-‐‑‒–—―−]/u;
const DIGIT_PATTERN = /\p{N}/u;
const EMOJI_PATTERN = /\p{Extended_Pictographic}/u;

const BAD_SPEECH_ENDINGS = [
  /(?:^|\s)(?:вы\s+)?сможете[.!?。]*$/iu,
  /(?:^|\s)(?:ты\s+)?сможешь[.!?。]*$/iu,
  /(?:^|\s)(?:он|она|оно|это)?\s*сможет[.!?。]*$/iu,
  /(?:^|\s)(?:можно|можете|может|будет|будете|помогает|позволяет)[.!?。]*$/iu,
  /(?:^|\s)(?:и|а|но|для|на|в|с|к|по|если|когда|чтобы)[.!?。]*$/iu,
  /(?:^|\s)(?:можно|можете|помогает|позволяет)\s+\p{L}+[.!?。]*$/iu,
];

const CUTAWAY_FACE_PATTERNS = [
  /смотрит\s+в\s+камеру/iu,
  /говорит\s+в\s+камеру/iu,
  /лиц[оа]\s+в\s+камер/iu,
  /face\s*[- ]?to\s*[- ]?camera/iu,
  /look(?:s|ing)?\s+(?:straight\s+)?(?:into|at)\s+the\s+camera/iu,
  /talk(?:s|ing)?\s+(?:straight\s+)?(?:into|to)\s+the\s+camera/iu,
];

const NO_HANDS_PATTERN = /без\s+рук|руки\s+вне\s+кадра|рук\s+нет|no\s+hands|without\s+hands|hands\s+out\s+of\s+frame/iu;
const HAND_ACTION_PATTERN = /в\s+руках|держит|бер[её]т|поднимает|крутит|поворачивает|рука\s+(?:двигает|бер[её]т|держит)|holds?|holding|picks?\s+it\s+up|hand\s+(?:moves?|turns?|holds?)/iu;
const TABLE_PATTERN = /на\s+столе|на\s+поверхности|на\s+кухонной\s+стойке|лежит|стоит|on\s+the\s+table|on\s+a\s+surface|on\s+the\s+counter|countertop/iu;
const IN_HANDS_PATTERN = /в\s+руках|на\s+весу|держит|бер[её]т\s+в\s+руки|holding|holds?|picks?\s+it\s+up/iu;
const PROVIDER_IMPRINT_PATTERNS = [
  {
    code: "subtitle_overlay_cue",
    pattern: /субтитр|caption|subtitle|текст\s+на\s+экран|надпис|оверле[йя]?|overlay|watermark|lower\s+third/iu,
    message: "Provider prompt must not mention subtitles, overlays, watermarks, or on screen text.",
  },
  {
    code: "platform_ui_cue",
    pattern: /instagram|tiktok|tik\s*tok|youtube|shorts|reels|инстаграм|тикток|шортс|рилс|телеграм|telegram|интерфейс|app\s+interface|ui\b/iu,
    message: "Provider prompt must not mention platforms or app interface cues.",
  },
];

export function validateDirectorSegmentPlan(plan: DirectorSegmentPlan): PromptValidationIssue[] {
  const issues: PromptValidationIssue[] = [];
  if (!Array.isArray(plan.segments) || plan.segments.length === 0) {
    addIssue(issues, "director.segments", "missing_segments", "Director plan must include segments.");
    return issues;
  }

  validateTextValues(plan, "director", issues);
  plan.segments.forEach((segment, index) => validateDirectorSegment(segment, index, issues));
  return issues;
}

export function validateProviderPromptPlan(plan: ProviderPromptPlan): PromptValidationIssue[] {
  const issues: PromptValidationIssue[] = [];
  if (!Array.isArray(plan.segmentPrompts) || plan.segmentPrompts.length === 0) {
    addIssue(issues, "provider.segmentPrompts", "missing_prompts", "Provider plan must include segment prompts.");
    return issues;
  }

  validateTextValues(plan, "provider", issues);
  plan.segmentPrompts.forEach((segment, index) => validateProviderSegment(segment, index, issues));
  validateProviderVoiceoverIsolation(plan, issues);
  return issues;
}

export function assertPromptChainValid(input: {
  directorPlan: DirectorSegmentPlan;
  providerPlan: ProviderPromptPlan;
}) {
  const issues = [
    ...validateDirectorSegmentPlan(input.directorPlan),
    ...validateProviderPromptPlan(input.providerPlan),
    ...validateDirectorProviderAlignment(input.directorPlan, input.providerPlan),
  ];
  const errors = issues.filter((issue) => issue.severity === "error");
  if (errors.length) throw new Error(formatPromptValidationIssues(errors));
  return issues;
}

export function formatPromptValidationIssues(issues: readonly PromptValidationIssue[]) {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
}

function validateDirectorSegment(segment: DirectorSegment, index: number, issues: PromptValidationIssue[]) {
  const path = `director.segments.${index}`;
  if (!segment.voiceover?.trim()) addIssue(issues, `${path}.voiceover`, "empty_voiceover", "Voiceover is required.");
  validateBadSpeechEnding(segment.voiceover, `${path}.voiceover`, issues);
  validateShotStructure(segment.shots, `${path}.shots`, issues);
  validatePhysicalConflict(segmentText(segment), path, issues);
}

function validateProviderSegment(segment: ProviderPromptSegment, index: number, issues: PromptValidationIssue[]) {
  const path = `provider.segmentPrompts.${index}`;
  if (!segment.voiceover?.trim()) addIssue(issues, `${path}.voiceover`, "empty_voiceover", "Voiceover is required.");
  if (!segment.prompt?.trim()) addIssue(issues, `${path}.prompt`, "empty_prompt", "Provider prompt is required.");
  validateBadSpeechEnding(segment.voiceover, `${path}.voiceover`, issues);
  validatePhysicalConflict(`${segment.voiceover} ${segment.prompt}`, path, issues);
  validateProviderPromptSpeech(segment, path, issues);
  validateProviderImprintCues(segment, path, issues);
}

function validateShotStructure(shots: DirectorShot[], path: string, issues: PromptValidationIssue[]) {
  if (!Array.isArray(shots) || shots.length < 3) {
    addIssue(issues, path, "invalid_shot_count", "Talking head segments need face, cutaway, and return shots.");
    return;
  }
  if (shots[0]?.role !== "face_open") {
    addIssue(issues, `${path}.0.role`, "bad_opening_role", "Talking head segment must start with face_open.");
  }
  if (shots[shots.length - 1]?.role !== "face_return") {
    addIssue(issues, `${path}.${shots.length - 1}.role`, "bad_closing_role", "Talking head segment must end with face_return.");
  }
  const cutawayIndexes = shots
    .map((shot, index) => (shot.role === "cutaway" ? index : -1))
    .filter((index) => index >= 0);
  if (!cutawayIndexes.length) addIssue(issues, path, "missing_cutaway", "Talking head segment must include a middle cutaway.");
  for (const index of cutawayIndexes) {
    if (index === 0 || index === shots.length - 1) {
      addIssue(issues, `${path}.${index}.role`, "cutaway_at_edge", "Cutaway cannot be the opening or closing shot.");
    }
    if (CUTAWAY_FACE_PATTERNS.some((pattern) => pattern.test(shots[index].action || ""))) {
      addIssue(issues, `${path}.${index}.action`, "cutaway_faces_camera", "Cutaway cannot show the presenter facing camera.");
    }
  }
}

function validateBadSpeechEnding(text: string, path: string, issues: PromptValidationIssue[]) {
  const normalized = normalizeText(text);
  if (BAD_SPEECH_ENDINGS.some((pattern) => pattern.test(normalized))) {
    addIssue(issues, path, "bad_speech_boundary", "Voiceover ends on an incomplete phrase.");
  }
}

function validatePhysicalConflict(text: string, path: string, issues: PromptValidationIssue[]) {
  if (NO_HANDS_PATTERN.test(text) && HAND_ACTION_PATTERN.test(text)) {
    addIssue(issues, path, "hands_conflict", "Prompt says both no hands and active hand interaction.");
  }
  if (TABLE_PATTERN.test(text) && IN_HANDS_PATTERN.test(text)) {
    addIssue(issues, path, "product_state_conflict", "Prompt says product is both on a surface and in hands.");
  }
}

function validateProviderPromptSpeech(
  segment: ProviderPromptSegment,
  path: string,
  issues: PromptValidationIssue[]
) {
  const occurrences = countNormalizedOccurrences(segment.prompt, segment.voiceover);
  if (occurrences > 0) {
    addIssue(
      issues,
      `${path}.prompt`,
      "prompt_voiceover_leak",
      "Provider prompt must not contain the direct voiceover text."
    );
  }
  if (!/реплик\p{L}*[\s\S]{0,80}раскадровк|storyboard[\s\S]{0,80}(?:speech|replica|spoken)|spoken_words/iu.test(segment.prompt)) {
    addIssue(
      issues,
      `${path}.prompt`,
      "prompt_missing_storyboard_speech_instruction",
      "Provider prompt must instruct Omni to read only the speech written in the storyboard."
    );
  }
}

function validateProviderImprintCues(
  segment: ProviderPromptSegment,
  path: string,
  issues: PromptValidationIssue[]
) {
  const promptWithoutSpeech = segment.prompt.split(segment.voiceover).join(" ");
  for (const item of PROVIDER_IMPRINT_PATTERNS) {
    if (item.pattern.test(promptWithoutSpeech)) addIssue(issues, `${path}.prompt`, item.code, item.message);
  }
}

function validateProviderVoiceoverIsolation(plan: ProviderPromptPlan, issues: PromptValidationIssue[]) {
  plan.segmentPrompts.forEach((segment, segmentIndex) => {
    plan.segmentPrompts.forEach((other, otherIndex) => {
      if (segmentIndex === otherIndex || !other.voiceover.trim()) return;
      if (countNormalizedOccurrences(segment.prompt, other.voiceover) > 0) {
        addIssue(
          issues,
          `provider.segmentPrompts.${segmentIndex}.prompt`,
          "neighbor_voiceover_leak",
          "Provider prompt must not contain another segment voiceover."
        );
      }
    });
  });
}

function validateTextValues(value: unknown, path: string, issues: PromptValidationIssue[]) {
  if (typeof value === "string") {
    validateForbiddenSymbols(value, path, issues);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateTextValues(item, `${path}.${index}`, issues));
    return;
  }
  if (value && typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      if (isMetadataField(key)) return;
      validateTextValues(item, `${path}.${key}`, issues);
    });
  }
}

function validateForbiddenSymbols(text: string, path: string, issues: PromptValidationIssue[]) {
  if (EMOJI_PATTERN.test(text)) addIssue(issues, path, "emoji", "Text values must not contain emoji.");
  if (DASH_PATTERN.test(text)) addIssue(issues, path, "dash", "Text values must not contain dashes or minus signs.");
  if (DIGIT_PATTERN.test(text)) addIssue(issues, path, "digit", "Text values must spell numbers as words.");
}

function validateDirectorProviderAlignment(
  directorPlan: DirectorSegmentPlan,
  providerPlan: ProviderPromptPlan
): PromptValidationIssue[] {
  const issues: PromptValidationIssue[] = [];
  if (directorPlan.segments.length !== providerPlan.segmentPrompts.length) {
    addIssue(issues, "provider.segmentPrompts", "segment_count_mismatch", "Provider prompt count must match director segments.");
  }
  providerPlan.segmentPrompts.forEach((prompt, index) => {
    const segment = directorPlan.segments[index];
    if (!segment) return;
    if (normalizeText(prompt.voiceover) !== normalizeText(segment.voiceover)) {
      addIssue(issues, `provider.segmentPrompts.${index}.voiceover`, "voiceover_mismatch", "Provider voiceover must match director segment voiceover.");
    }
  });
  return issues;
}

function segmentText(segment: DirectorSegment) {
  return [
    segment.voiceover,
    segment.productState,
    segment.endState,
    ...segment.shots.map((shot) => shot.action),
  ].join(" ");
}

function normalizeText(text: string) {
  return text.toLowerCase().replace(/ё/g, "е").replace(/\s+/gu, " ").trim();
}

function countNormalizedOccurrences(haystack: string, needle: string) {
  const normalizedNeedle = normalizeText(needle);
  if (!normalizedNeedle) return 0;
  return normalizeText(haystack).split(normalizedNeedle).length - 1;
}

function addIssue(
  issues: PromptValidationIssue[],
  path: string,
  code: string,
  message: string,
  severity: PromptValidationIssue["severity"] = "error"
) {
  issues.push({ path, code, message, severity });
}

function isMetadataField(key: string) {
  return [
    "durationSeconds",
    "duration_seconds",
    "format",
    "index",
    "referenceRole",
    "reference_role",
    "role",
    "version",
  ].includes(key);
}
