import type { SubtitleMode, SubtitleStylePreset } from "@/types";
import {
  applyReelsSubtitleDefaultsToLegacy,
  DEFAULT_SUBTITLE_FONT_FAMILY,
  DEFAULT_SUBTITLE_FONT_SIZE,
  DEFAULT_SUBTITLE_OUTLINE_WIDTH,
  SUBTITLE_PRESET_DEFAULT_MARGIN_PERCENT,
  SUBTITLE_PRESET_DEFAULT_MARGIN_V,
} from "@/lib/subtitles";

export type OmniSubtitleStatus = "none" | "not_requested" | "queued" | "transcribing" | "rendering" | "completed" | "failed";
export type OmniSubtitleTimingProvider = "deepgram";
export type OmniSubtitlePosition = "bottom" | "middle_bottom" | "top";

export type OmniSubtitleSettings = {
  subtitles_enabled: boolean;
  subtitle_mode: SubtitleMode;
  subtitle_style_preset: SubtitleStylePreset;
  subtitle_font_family: string;
  subtitle_font_color: string;
  subtitle_font_size: number;
  subtitle_font_weight: 400 | 700;
  subtitle_outline_color: string;
  subtitle_outline_width: number;
  subtitle_margin_v: number;
  subtitle_margin_percent: number;
  typography_hook_enabled: boolean;
  timing_provider: OmniSubtitleTimingProvider;
  position: OmniSubtitlePosition;
};

export const DEFAULT_OMNI_SUBTITLE_SETTINGS: OmniSubtitleSettings = {
  subtitles_enabled: true,
  subtitle_mode: "phrase_block",
  subtitle_style_preset: "impact",
  subtitle_font_family: DEFAULT_SUBTITLE_FONT_FAMILY,
  subtitle_font_color: "#FFFFFF",
  subtitle_font_size: DEFAULT_SUBTITLE_FONT_SIZE,
  subtitle_font_weight: 700,
  subtitle_outline_color: "#111111",
  subtitle_outline_width: DEFAULT_SUBTITLE_OUTLINE_WIDTH,
  subtitle_margin_v: SUBTITLE_PRESET_DEFAULT_MARGIN_V.impact,
  subtitle_margin_percent: SUBTITLE_PRESET_DEFAULT_MARGIN_PERCENT.impact,
  typography_hook_enabled: false,
  timing_provider: "deepgram",
  position: "middle_bottom",
};

export const OMNI_SUBTITLE_STYLE_LABELS: Record<SubtitleStylePreset, string> = {
  classic: "Clean",
  impact: "Reels Caps",
  soft_box: "Soft box",
};

export const OMNI_SUBTITLE_MODE_LABELS: Record<SubtitleMode, string> = {
  phrase_block: "Фразами",
  word_by_word: "По словам",
};

function normalizeNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeHex(value: unknown, fallback: string) {
  const raw = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw.toUpperCase() : fallback;
}

export function normalizeOmniSubtitleSettings(input?: Partial<OmniSubtitleSettings> | null): OmniSubtitleSettings {
  const source = input || {};
  const style: SubtitleStylePreset = isSubtitleStylePreset(source.subtitle_style_preset)
    ? source.subtitle_style_preset
    : DEFAULT_OMNI_SUBTITLE_SETTINGS.subtitle_style_preset;
  const mode: SubtitleMode = isSubtitleMode(source.subtitle_mode)
    ? source.subtitle_mode
    : DEFAULT_OMNI_SUBTITLE_SETTINGS.subtitle_mode;
  const position: OmniSubtitlePosition = isSubtitlePosition(source.position)
    ? source.position
    : DEFAULT_OMNI_SUBTITLE_SETTINGS.position;

  return applyReelsSubtitleDefaultsToLegacy({
    ...DEFAULT_OMNI_SUBTITLE_SETTINGS,
    ...source,
    subtitles_enabled: source.subtitles_enabled !== false,
    subtitle_mode: mode,
    subtitle_style_preset: style,
    subtitle_font_family: typeof source.subtitle_font_family === "string" && source.subtitle_font_family.trim()
      ? source.subtitle_font_family.trim()
      : DEFAULT_OMNI_SUBTITLE_SETTINGS.subtitle_font_family,
    subtitle_font_color: normalizeHex(source.subtitle_font_color, DEFAULT_OMNI_SUBTITLE_SETTINGS.subtitle_font_color),
    subtitle_font_size: normalizeNumber(source.subtitle_font_size, DEFAULT_OMNI_SUBTITLE_SETTINGS.subtitle_font_size, 18, 120),
    subtitle_font_weight: Number(source.subtitle_font_weight) === 400 ? 400 : 700,
    subtitle_outline_color: normalizeHex(source.subtitle_outline_color, DEFAULT_OMNI_SUBTITLE_SETTINGS.subtitle_outline_color),
    subtitle_outline_width: normalizeNumber(
      source.subtitle_outline_width,
      DEFAULT_OMNI_SUBTITLE_SETTINGS.subtitle_outline_width,
      0,
      8
    ),
    subtitle_margin_v: normalizeNumber(source.subtitle_margin_v, DEFAULT_OMNI_SUBTITLE_SETTINGS.subtitle_margin_v, 0, 900),
    subtitle_margin_percent: normalizeNumber(
      source.subtitle_margin_percent,
      DEFAULT_OMNI_SUBTITLE_SETTINGS.subtitle_margin_percent,
      0,
      40
    ),
    typography_hook_enabled: Boolean(source.typography_hook_enabled),
    timing_provider: "deepgram",
    position,
  });
}

export function marginPercentForSubtitlePosition(position: OmniSubtitlePosition) {
  if (position === "top") return 78;
  if (position === "middle_bottom") return 30;
  return DEFAULT_OMNI_SUBTITLE_SETTINGS.subtitle_margin_percent;
}

function isSubtitleStylePreset(value: unknown): value is SubtitleStylePreset {
  return value === "classic" || value === "impact" || value === "soft_box";
}

function isSubtitleMode(value: unknown): value is SubtitleMode {
  return value === "phrase_block" || value === "word_by_word";
}

function isSubtitlePosition(value: unknown): value is OmniSubtitlePosition {
  return value === "bottom" || value === "middle_bottom" || value === "top";
}
