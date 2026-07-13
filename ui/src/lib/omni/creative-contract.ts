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
  "Open packaging only with hands, never with teeth",
  "Never film while driving; a car scene must be parked",
  "Use at most one handled object per beat and two objects per scene",
  "Do not use a product close-up followed by a return to the speaker",
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

export type ProductRole = "hidden" | "background_prop" | "natural_use" | "brief_demo";

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

export interface OmniSegmentCreativePlan {
  segmentIndex: number;
  lifeFormatId: LifeFormatId;
  speechStartsAtSeconds: 0;
  voiceoverText: string;
  productRole: ProductRole;
  continuityProps: readonly OmniContinuityProp[];
  beats: readonly [OmniCreativeBeat, OmniCreativeBeat, OmniCreativeBeat];
}

export interface OmniPromptValidationResult {
  valid: boolean;
  score: number;
  errors: string[];
  warnings: string[];
}
