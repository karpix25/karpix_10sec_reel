export type OmniProjectStatus = "active" | "archived";
export type OmniReelStatus = "draft" | "queued" | "generating" | "stitching" | "completed" | "failed";
export type OmniSegmentStatus = "draft" | "queued" | "submitted" | "processing" | "completed" | "failed";

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
  avatar_reference_notes: string | null;
  target_duration_seconds: number;
  product_refs: OmniReferenceAsset[];
  avatar_refs: OmniReferenceAsset[];
  created_at: string;
  updated_at: string;
}

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

export interface OmniClientAvatar {
  id: number;
  project_id: number;
  prompt: string;
  reference_url: string | null;
  status: "draft" | "queued" | "generating" | "completed" | "failed";
  provider: string;
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
  source_legacy_scenario_id: number | null;
  target_duration_seconds: number;
  segment_count: number;
  status: OmniReelStatus;
  brief: string | null;
  source_snapshot: Record<string, unknown> | null;
  product_snapshot: Record<string, unknown> | null;
  avatar_snapshot: Record<string, unknown> | null;
  stitch_status: "not_ready" | "ready" | "queued" | "stitching" | "completed" | "failed";
  final_video_url: string | null;
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
  reference_url: string | null;
  kie_task_id: string | null;
  status: OmniSegmentStatus;
  video_url: string | null;
  error_message: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}
