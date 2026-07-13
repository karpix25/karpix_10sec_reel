import type {
  OmniPromptValidationResult,
  OmniSegmentCreativePlan,
} from "@/lib/omni/creative-contract";
import { hasForbiddenOmniScriptSymbols } from "./omni-script-text-contract";

const FORBIDDEN_ACTION_PATTERNS = [
  /(?:у|через|перед)\s+зеркал/iu,
  /(?:видно|появляется|говорит)\s+(?:в|через)\s+отражен/iu,
  /открыва(?:ет|я)\s+.*зуб/iu,
  /(?:ведет|ведёт|управляет)\s+автомобил/iu,
  /закрывает\s+(?:объектив|камеру)\s+(?:рукой|ладонью)/iu,
  /крупный\s+план\s+продукта.*(?:возвращ|обратно).*лиц/iu,
];

const CONSUMPTION_DURING_SPEECH =
  /(?:ест|жует|жуёт|кусает|пьет|пьёт|глотает|наносит\s+на\s+(?:лицо|губы)).*(?:говорит|продолжает\s+речь)/iu;

export function validateOmniSegmentPrompt(input: {
  prompt: string;
  plan: OmniSegmentCreativePlan;
}): OmniPromptValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const actions = input.plan.beats.map((beat) => beat.action);
  const joinedActions = actions.join(" ");
  const exactQuote = `"${input.plan.voiceoverText}"`;

  if (input.plan.speechStartsAtSeconds !== 0 || !input.prompt.includes("0.0 секунде")) {
    errors.push("speech_must_start_at_zero");
  }
  if (input.prompt.split(exactQuote).length - 1 !== 1) {
    errors.push("exact_voiceover_must_appear_once");
  }
  if (hasForbiddenOmniScriptSymbols(input.plan.voiceoverText)) {
    errors.push("voiceover_contains_long_dash_or_emoji");
  }
  if (!input.prompt.includes("ПАСПОРТ РЕКВИЗИТА ДЛЯ ВСЕХ ЧАСТЕЙ:")) {
    errors.push("continuity_prop_passport_required");
  }
  for (const item of input.plan.continuityProps) {
    if (!input.prompt.includes(item.name) || !input.prompt.includes(item.appearance)) {
      errors.push("continuity_prop_details_missing");
      break;
    }
  }
  if (input.plan.beats.length !== 3 || actions.some((action) => !action.trim())) {
    errors.push("three_complete_beats_required");
  }
  if (!hasContinuousTimeline(input.plan)) errors.push("beats_must_cover_segment_without_gaps");
  if (FORBIDDEN_ACTION_PATTERNS.some((pattern) => pattern.test(joinedActions))) {
    errors.push("forbidden_visual_motif");
  }
  if (CONSUMPTION_DURING_SPEECH.test(joinedActions)) errors.push("consumption_during_speech");
  if (input.plan.productRole !== "brief_demo" && /(?:этикетк|логотип).*(?:камер|центр)/iu.test(joinedActions)) {
    errors.push("advertising_product_display");
  }

  const words = input.plan.voiceoverText.split(/\s+/).filter(Boolean);
  const firstSentenceWords = getFirstSentenceWordCount(input.plan.voiceoverText);
  const segmentSeconds = input.plan.beats[2].endSeconds;
  const maxWords = Math.floor(segmentSeconds * 2.4);
  if (words.length > maxWords) errors.push("voiceover_exceeds_segment_word_budget");
  if (firstSentenceWords > 15) warnings.push("spoken_hook_may_exceed_four_seconds");
  if (new Set(actions.map(normalize)).size !== actions.length) warnings.push("repeated_beat_action");

  return {
    valid: errors.length === 0,
    score: Math.max(0, 100 - errors.length * 25 - warnings.length * 6),
    errors,
    warnings,
  };
}

export function validateVoiceoverSequence(expectedScript: string, plans: readonly OmniSegmentCreativePlan[]) {
  const reconstructed = normalize(plans.map((plan) => plan.voiceoverText).join(" "));
  return reconstructed === normalize(expectedScript);
}

function hasContinuousTimeline(plan: OmniSegmentCreativePlan) {
  const [first, second, third] = plan.beats;
  return first.startSeconds === 0 && first.endSeconds === second.startSeconds &&
    second.endSeconds === third.startSeconds && third.endSeconds > third.startSeconds;
}

function getFirstSentenceWordCount(text: string) {
  return (text.split(/[.!?]/, 1)[0] || text).split(/\s+/).filter(Boolean).length;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}
