import type { WordTimestamp } from "@/types";
import type { OmniSubtitleSettings, OmniSubtitleStatus } from "./subtitle-settings";

export type OmniProjectStatus = "active" | "archived";
export type OmniReelStatus = "draft" | "queued" | "generating" | "stitching" | "completed" | "failed";
export type OmniSegmentStatus = "draft" | "queued" | "submitted" | "processing" | "completed" | "failed";
export type { OmniSubtitleStatus } from "./subtitle-settings";

export interface OmniProject {
  id: number;
  name: string;
  description: string | null;
  target_audience: string | null;
  brand_voice: string | null;
  legacy_client_id: number | null;
  status: OmniProjectStatus;
  telegram_chat_id: string | null;
  telegram_topic_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface OmniProduct {
  id: number;
  project_id: number;
  name: string;
  description: string | null;
  product_reference_notes: string | null;
  product_visual_profile: ProductVisualProfile | null;
  product_visual_profile_status: ProductVisualProfileStatus;
  product_visual_profile_model: string | null;
  product_visual_profile_error: string | null;
  product_visual_profile_updated_at: string | null;
  avatar_reference_notes: string | null;
  target_duration_seconds: number;
  cta_mode: CtaMode;
  cta_value: string | null;
  product_refs: OmniReferenceAsset[];
  avatar_refs: OmniReferenceAsset[];
  created_at: string;
  updated_at: string;
}

export type ProductVisualProfileStatus = "missing" | "processing" | "completed" | "failed";

export type ProductVisualProfile = {
  physical_form: string;
  package_type: string;
  colors: string[];
  materials_finish: string[];
  size_proportions: string;
  labels_text_logo_placement: string;
  cap_closure_seal: string;
  texture: string;
  must_preserve: string[];
  must_not_change: string[];
  prompt_summary: string;
};

export interface OmniReferenceAsset {
  id: string;
  url: string;
  kind: "image" | "video" | "note";
  role?: "product_primary" | "product_secondary" | "avatar_reference" | "continuity_reference";
  label?: string;
  storage_provider?: "s3" | "external" | "manual";
  content_type?: string | null;
  status?: "ready" | "uploading" | "failed" | "manual_url";
  is_primary?: boolean;
  created_at?: string;
}

export interface OmniLegacyScenario {
  id: number;
  client_id: number | null;
  script: string;
  title: string | null;
  topic: string | null;
  created_at: string | null;
  source_reference: string | null;
  legacy_client_name?: string | null;
  legacy_product_keyword?: string | null;
  reels_url?: string | null;
  word_count?: number | null;
  duration_seconds?: number | null;
}

export interface OmniLegacyLibrary {
  client_id: number;
  name: string;
  product_info: string | null;
  product_keyword: string | null;
  niche: string | null;
  scenario_count: number;
  last_scenario_at: string | null;
}

export interface OmniLegacyLibraryLink {
  id: number;
  project_id: number;
  product_id: number | null;
  legacy_client_id: number;
  created_at: string;
}

export interface OmniGeneratedScript {
  id: number;
  project_id: number;
  product_id: number;
  source_legacy_scenario_id: number | null;
  source_legacy_client_id: number | null;
  director_analysis_id: number | null;
  status: "draft" | "approved" | "archived";
  title: string | null;
  hook: string | null;
  script: string;
  caption: string | null;
  cta_keyword: string | null;
  lead_magnet: string | null;
  source_snapshot: Record<string, unknown> | null;
  product_snapshot: Record<string, unknown> | null;
  model: string | null;
  created_at: string;
  updated_at: string;
}

export interface OmniPromptPreviewSegment {
  segmentIndex: number;
  durationSeconds: number;
  role: string;
  prompt: string;
  referenceUrl: string | null;
  voiceoverText?: string;
  creativeStrategy?: OmniCreativeStrategy;
  creativePlan?: OmniSegmentCreativePlan;
  validation?: OmniPromptValidationResult;
}

export interface OmniClientAvatar {
  id: number;
  project_id: number;
  display_name: string | null;
  prompt: string;
  reference_url: string | null;
  status: "draft" | "queued" | "generating" | "completed" | "approved" | "failed";
  provider: string;
  kie_character_id: string | null;
  kie_character_status: string | null;
  kie_character_payload: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OmniLegacyScenarioLink {
  id: number;
  project_id: number;
  product_id: number | null;
  legacy_source: string;
  legacy_scenario_id: number;
  note: string | null;
  created_at: string;
}

export interface OmniReel {
  id: number;
  project_id: number;
  product_id: number;
  source_generated_script_id: number | null;
  source_legacy_scenario_id: number | null;
  target_duration_seconds: number;
  segment_count: number;
  status: OmniReelStatus;
  brief: string | null;
  source_snapshot: Record<string, unknown> | null;
  product_snapshot: Record<string, unknown> | null;
  avatar_snapshot: Record<string, unknown> | null;
  creative_strategy: OmniCreativeStrategy | null;
  prompt_contract_version: string | null;
  stitch_status: "not_ready" | "ready" | "queued" | "stitching" | "completed" | "failed";
  final_video_url: string | null;
  final_s3_url?: string | null;
  subtitles_status?: OmniSubtitleStatus | null;
  subtitled_video_url?: string | null;
  subtitles_error?: string | null;
  subtitles_settings?: OmniSubtitleSettings | null;
  subtitles_transcript?: {
    provider?: string;
    model?: string;
    transcript?: string;
    words?: WordTimestamp[];
    word_count?: number;
    updated_at?: string;
  } | null;
  yandex_disk_path?: string | null;
  yandex_public_url?: string | null;
  yandex_status?: "pending" | "completed" | "skipped" | "failed" | null;
  yandex_error?: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface OmniReelSegment {
  id: number;
  reel_id: number;
  segment_index: number;
  duration_seconds: number;
  slot_role: string | null;
  prompt: string | null;
  voiceover_text: string | null;
  creative_plan: OmniSegmentCreativePlan | null;
  prompt_validation: OmniPromptValidationResult | null;
  reference_url: string | null;
  kie_task_id: string | null;
  generation_provider: string;
  status: OmniSegmentStatus;
  video_url: string | null;
  error_message: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  continuity_frame_url: string | null;
  continuity_kie_file_url: string | null;
  continuity_source_segment_id: number | null;
  continuity_applied: boolean;
  request_payload?: Record<string, unknown> | null;
  response_payload?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}
import type {
  CtaMode,
  OmniCreativeStrategy,
  OmniPromptValidationResult,
  OmniSegmentCreativePlan,
} from "@/lib/omni/creative-contract";
