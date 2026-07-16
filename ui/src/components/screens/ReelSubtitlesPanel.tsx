"use client";

import { useMemo, useState } from "react";
import { Captions, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_OMNI_SUBTITLE_SETTINGS,
  marginPercentForSubtitlePosition,
  normalizeOmniSubtitleSettings,
  OMNI_SUBTITLE_MODE_LABELS,
  OMNI_SUBTITLE_STYLE_LABELS,
  type OmniSubtitlePosition,
  type OmniSubtitleSettings,
} from "@/lib/omni/subtitle-settings";
import { SUBTITLE_FONT_OPTIONS } from "@/lib/subtitles";
import type { OmniReel } from "@/lib/omni/types";
import type { SubtitleMode, SubtitleStylePreset } from "@/types";

const POSITIONS: Array<{ value: OmniSubtitlePosition; label: string }> = [
  { value: "bottom", label: "Низ" },
  { value: "middle_bottom", label: "Центр-низ" },
  { value: "top", label: "Верх" },
];

const MODES = Object.keys(OMNI_SUBTITLE_MODE_LABELS) as SubtitleMode[];
const STYLES = Object.keys(OMNI_SUBTITLE_STYLE_LABELS) as SubtitleStylePreset[];

export function ReelSubtitlesPanel({
  reel,
  onReelUpdate,
}: {
  reel: OmniReel;
  onReelUpdate: (reel: OmniReel) => void;
}) {
  const [settings, setSettings] = useState<OmniSubtitleSettings>(() =>
    normalizeOmniSubtitleSettings(reel.subtitles_settings || DEFAULT_OMNI_SUBTITLE_SETTINGS)
  );
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isBusy = isRendering || reel.subtitles_status === "transcribing" || reel.subtitles_status === "rendering";
  const statusLabel = getSubtitleStatusLabel(isRendering ? "rendering" : reel.subtitles_status);
  const wordsCount = getWordCount(reel);

  const previewStyle = useMemo(() => buildPreviewStyle(settings), [settings]);

  const updateSettings = (patch: Partial<OmniSubtitleSettings>) => {
    setSettings((current) => normalizeOmniSubtitleSettings({ ...current, ...patch }));
  };

  const setPosition = (position: OmniSubtitlePosition) => {
    updateSettings({
      position,
      subtitle_margin_percent: marginPercentForSubtitlePosition(position),
      subtitle_margin_v: Math.round((marginPercentForSubtitlePosition(position) / 100) * 1920),
    });
  };

  const renderSubtitles = async () => {
    setIsRendering(true);
    setError(null);
    try {
      const response = await fetch(`/api/omni/reels/${reel.id}/subtitles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Не удалось собрать субтитры");
      }
      onReelUpdate(payload as OmniReel);
    } catch (renderError) {
      setError(renderError instanceof Error ? renderError.message : "Не удалось собрать субтитры");
    } finally {
      setIsRendering(false);
    }
  };

  return (
    <section className="mt-3 rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            <Captions className="h-4 w-4" />
            Субтитры
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Deepgram тайминги · ASS/libass burned-in · {statusLabel}
          </p>
        </div>
        <Button type="button" size="sm" onClick={renderSubtitles} disabled={!reel.final_video_url || isBusy}>
          {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {isBusy ? "Собираю..." : "Пересобрать"}
        </Button>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_12rem]">
        <div className="grid gap-3">
          <OptionGroup
            label="Режим"
            value={settings.subtitle_mode}
            options={MODES.map((value) => ({ value, label: OMNI_SUBTITLE_MODE_LABELS[value] }))}
            onChange={(value) => updateSettings({ subtitle_mode: value as SubtitleMode })}
          />
          <OptionGroup
            label="Стиль"
            value={settings.subtitle_style_preset}
            options={STYLES.map((value) => ({ value, label: OMNI_SUBTITLE_STYLE_LABELS[value] }))}
            onChange={(value) => updateSettings({ subtitle_style_preset: value as SubtitleStylePreset })}
          />
          <OptionGroup
            label="Позиция"
            value={settings.position}
            options={POSITIONS}
            onChange={(value) => setPosition(value as OmniSubtitlePosition)}
          />

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-xs text-muted-foreground">
              Размер
              <input
                type="range"
                min={24}
                max={72}
                value={settings.subtitle_font_size}
                onChange={(event) => updateSettings({ subtitle_font_size: Number(event.target.value) })}
              />
              <span>{Math.round(settings.subtitle_font_size)} px</span>
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Цвет
              <input
                type="color"
                value={settings.subtitle_font_color}
                onChange={(event) => updateSettings({ subtitle_font_color: event.target.value })}
                className="h-9 w-full rounded border border-border bg-background"
              />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Обводка
              <input
                type="color"
                value={settings.subtitle_outline_color}
                onChange={(event) => updateSettings({ subtitle_outline_color: event.target.value })}
                className="h-9 w-full rounded border border-border bg-background"
              />
            </label>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-black p-2">
          <div className="relative mx-auto aspect-[9/16] max-h-64 overflow-hidden rounded-md bg-gradient-to-b from-slate-700 via-slate-900 to-black">
            <div className="absolute inset-x-4 text-center" style={previewStyle.container}>
              <span className={previewStyle.className} style={previewStyle.text}>
                Заботься о себе с удовольствием
              </span>
            </div>
          </div>
        </div>
      </div>

      {(error || reel.subtitles_error) ? (
        <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error || reel.subtitles_error}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {wordsCount ? <span className="rounded-md bg-muted px-2 py-1">{wordsCount} слов по Deepgram</span> : null}
        {reel.subtitled_video_url ? (
          <a
            href={reel.subtitled_video_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-primary hover:bg-muted"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Открыть версию с субтитрами
          </a>
        ) : null}
      </div>
    </section>
  );
}

function OptionGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={value === option.value ? "secondary" : "outline"}
            onClick={() => onChange(option.value)}
            className="h-8 px-2 text-xs"
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function buildPreviewStyle(settings: OmniSubtitleSettings) {
  const fontFamily = SUBTITLE_FONT_OPTIONS[settings.subtitle_font_family as keyof typeof SUBTITLE_FONT_OPTIONS]?.family || "PT Sans";
  const bottom = settings.position === "top" ? undefined : `${settings.subtitle_margin_percent}%`;
  const top = settings.position === "top" ? "14%" : undefined;
  return {
    container: { bottom, top },
    className: settings.subtitle_style_preset === "soft_box" ? "rounded-xl bg-black/55 px-3 py-2" : "",
    text: {
      color: settings.subtitle_font_color,
      fontFamily,
      fontSize: `${Math.max(12, settings.subtitle_font_size * 0.34)}px`,
      fontWeight: settings.subtitle_font_weight,
      textTransform: settings.subtitle_style_preset === "impact" ? "uppercase" : "none",
      WebkitTextStroke:
        settings.subtitle_style_preset === "soft_box"
          ? undefined
          : `${Math.max(0.5, settings.subtitle_outline_width * 0.34)}px ${settings.subtitle_outline_color}`,
      textShadow:
        settings.subtitle_style_preset === "soft_box"
          ? "0 8px 18px rgba(0,0,0,0.45)"
          : `0 0 6px ${settings.subtitle_outline_color}`,
    },
  };
}

function getSubtitleStatusLabel(status: OmniReel["subtitles_status"]) {
  if (status === "transcribing") return "транскрибация";
  if (status === "rendering") return "рендер";
  if (status === "completed") return "готово";
  if (status === "failed") return "ошибка";
  return "не собирались";
}

function getWordCount(reel: OmniReel) {
  const count = reel.subtitles_transcript?.word_count;
  return typeof count === "number" && count > 0 ? count : null;
}
