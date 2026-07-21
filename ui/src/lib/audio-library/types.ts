import type { AudioMood } from "./moods";

export type AudioTrackStatus = "active" | "archived";

export interface AudioTrack {
  id: number;
  mood: AudioMood;
  title: string;
  file_name: string;
  file_url: string;
  content_type: string | null;
  duration_seconds: number | null;
  status: AudioTrackStatus;
  play_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}
