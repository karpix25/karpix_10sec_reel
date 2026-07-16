import pool from "@/lib/db";
import type { OmniReel } from "@/lib/omni/types";
import {
  normalizeOmniSubtitleSettings,
  type OmniSubtitleSettings,
} from "@/lib/omni/subtitle-settings";
import { getOmniProject } from "./projects";

type ClientSubtitleSettingsRow = {
  subtitles_enabled: boolean | null;
  subtitle_mode: OmniSubtitleSettings["subtitle_mode"] | null;
  subtitle_style_preset: OmniSubtitleSettings["subtitle_style_preset"] | null;
  subtitle_font_family: string | null;
  subtitle_font_color: string | null;
  subtitle_font_size: number | null;
  subtitle_font_weight: number | null;
  subtitle_outline_color: string | null;
  subtitle_outline_width: number | null;
  subtitle_margin_v: number | null;
  subtitle_margin_percent: number | null;
  typography_hook_enabled: boolean | null;
};

export async function resolveOmniProjectSubtitleSettings(input: {
  reel: OmniReel;
  override?: Partial<OmniSubtitleSettings> | null;
}) {
  if (input.override) return normalizeOmniSubtitleSettings(input.override);

  const project = await getOmniProject(input.reel.project_id);
  if (!project?.legacy_client_id) {
    return normalizeOmniSubtitleSettings(input.reel.subtitles_settings);
  }

  const { rows } = await pool.query<ClientSubtitleSettingsRow>(
    `SELECT subtitles_enabled,
            subtitle_mode,
            subtitle_style_preset,
            subtitle_font_family,
            subtitle_font_color,
            subtitle_font_size,
            subtitle_font_weight,
            subtitle_outline_color,
            subtitle_outline_width,
            subtitle_margin_v,
            subtitle_margin_percent,
            typography_hook_enabled
     FROM clients
     WHERE id = $1
     LIMIT 1`,
    [project.legacy_client_id]
  );

  return normalizeOmniSubtitleSettings(rows[0] ? mapClientSubtitleSettings(rows[0]) : input.reel.subtitles_settings);
}

function mapClientSubtitleSettings(row: ClientSubtitleSettingsRow): Partial<OmniSubtitleSettings> {
  return {
    subtitles_enabled: row.subtitles_enabled ?? undefined,
    subtitle_mode: row.subtitle_mode ?? undefined,
    subtitle_style_preset: row.subtitle_style_preset ?? undefined,
    subtitle_font_family: row.subtitle_font_family ?? undefined,
    subtitle_font_color: row.subtitle_font_color ?? undefined,
    subtitle_font_size: row.subtitle_font_size ?? undefined,
    subtitle_font_weight: row.subtitle_font_weight === 400 ? 400 : row.subtitle_font_weight === 700 ? 700 : undefined,
    subtitle_outline_color: row.subtitle_outline_color ?? undefined,
    subtitle_outline_width: row.subtitle_outline_width ?? undefined,
    subtitle_margin_v: row.subtitle_margin_v ?? undefined,
    subtitle_margin_percent: row.subtitle_margin_percent ?? undefined,
    typography_hook_enabled: row.typography_hook_enabled ?? undefined,
  };
}
