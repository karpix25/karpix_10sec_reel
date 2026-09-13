export const OMNI_FORBIDDEN_MOTIFS = [
  "mirror",
  "reflection",
  "mirror selfie",
  "filming through a mirror",
  "reflective surface",
  "зеркало",
  "отражение",
  "съемка через зеркало",
  "съёмка через зеркало",
] as const;

export const OMNI_ACTION_SAFETY_RULES = [
  "Do not eat or drink while speaking",
  "Show the product only in standalone object-only B-roll on stable support, without people, hands, or interaction",
  "Keep the product stationary with the same packaging, form, scale, and physical state; move the camera or focus instead",
  "The presenter never drives and uses simple gestures without handling the product",
  "Allow explicit montage cuts from the speaker to product B-roll and back to the speaker while the same voiceover continues",
] as const;

export type LifeFormatId =
  | "talking_head_cutaways"
  | "grwm"
  | "moving_vlog"
  | "morning_routine"
  | "post_workout"
  | "facetime_friend"
  | "work_break"
  | "whats_in_my_bag"
  | "habit_replacement";

export type ProductRole = "hidden" | "background_prop" | "natural_use" | "brief_demo" | "digital_demo";

export type CtaMode =
  | "article_in_description"
  | "keyword_in_comments"
  | "link_in_profile"
  | "no_explicit_cta";

export type HookType =
  | "problem_in_action"
  | "result_first"
  | "unexpected_object"
  | "contrast"
  | "broken_expectation"
  | "micro_demonstration";

export type ActionComplexity = "low" | "medium";

export type VisualStyleId =
  | "talking_head_home"
  | "beauty_daylight"
  | "kitchen_counter"
  | "worktable_focus"
  | "fitness_locker"
  | "sofa_confession"
  | "clean_product_table"
  | "city_window";

export interface OmniContinuityProp {
  name: string;
  appearance: string;
  initialPosition: string;
}

export interface OmniLifeSceneArc {
  id: string;
  setting: string;
  fixedProps: readonly OmniContinuityProp[];
  states: readonly [string, string, string, string, string, string, string, string, string];
}

export interface OmniLifeFormat {
  id: LifeFormatId;
  uiLabel: string;
  providerDescription: string;
  retentionPriority: number;
  semanticKeywords: readonly string[];
  audienceKeywords: readonly string[];
  sceneArcs: readonly OmniLifeSceneArc[];
  allowedProductRoles: readonly ProductRole[];
  preferredProductRoles: readonly ProductRole[];
  compatibleHooks: readonly HookType[];
  actionComplexity: ActionComplexity;
  adjacentFormats: readonly LifeFormatId[];
  forbiddenMotifs: readonly string[];
  safetyRules: readonly string[];
}

export interface OmniVisualStylePlan {
  id: VisualStyleId;
  label: string;
  visualTone: string;
  cameraLanguage: string;
  lighting: string;
  sceneArc: OmniLifeSceneArc;
  forbiddenDefaults: readonly string[];
  selectionReason: string;
}

export interface CreativeScoreBreakdown {
  semanticFit: number;
  productNaturalness: number;
  audienceSettingFit: number;
  actionFeasibility: number;
  noveltyPenalty: number;
  total: number;
}

export interface OmniCreativeStrategy {
  version: "life-formats-v1" | "visual-style-writer-v1";
  scope: "reel";
  referenceSceneMode?: string;
  lifeFormatId: LifeFormatId;
  providerFormatDescription: string;
  setting: string;
  continuityProps: readonly OmniContinuityProp[];
  visualStyle?: OmniVisualStylePlan;
  hookType: HookType;
  hookRule: string;
  productRole: ProductRole;
  productActionRule: string;
  ctaMode: CtaMode;
  ctaValue: string | null;
  selectionReason: string;
  score: CreativeScoreBreakdown;
  forbiddenMotifs: readonly string[];
  safetyRules: readonly string[];
}

export interface OmniCreativeBeat {
  startSeconds: number;
  endSeconds: number;
  action: string;
}

export interface OmniScriptBeatCue {
  stage: string;
  visualCue: string;
  voiceover: string;
}

export interface OmniSegmentCreativePlan {
  segmentIndex: number;
  lifeFormatId: LifeFormatId;
  referenceSceneMode?: string;
  speechStartsAtSeconds: 0;
  voiceoverText: string;
  productRole: ProductRole;
  /** Optional frame-level product window; absent on legacy saved plans. */
  productVisibleByFrame?: readonly boolean[];
  continuityProps: readonly OmniContinuityProp[];
  scriptBeats?: readonly OmniScriptBeatCue[];
  beats: readonly [OmniCreativeBeat, OmniCreativeBeat, OmniCreativeBeat];
}

export interface OmniPromptValidationResult {
  valid: boolean;
  score: number;
  errors: string[];
  warnings: string[];
}
