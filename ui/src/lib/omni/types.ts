export type OmniProjectStatus = "active" | "archived";
export type OmniReelStatus = "draft" | "queued" | "generating" | "stitching" | "completed" | "failed";
export type OmniSegmentStatus = "draft" | "queued" | "submitted" | "processing" | "completed" | "failed";

export interface OmniProject {
  id: number;
  name: string;
  description: string | null;
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
  label?: string;
}

export interface OmniLegacyScenario {
  id: number;
  client_id: number | null;
  script: string;
  title: string | null;
  topic: string | null;
  created_at: string | null;
  source_reference: string | null;
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
  prompt: string | null;
  kie_task_id: string | null;
  status: OmniSegmentStatus;
  video_url: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}
