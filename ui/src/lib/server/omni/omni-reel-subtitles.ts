import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import pool from "@/lib/db";
import {
  marginPercentForSubtitlePosition,
  normalizeOmniSubtitleSettings,
  type OmniSubtitleSettings,
} from "@/lib/omni/subtitle-settings";
import type { OmniReel } from "@/lib/omni/types";
import type { WordTimestamp } from "@/types";
import { materializeSubtitleTrack } from "@/lib/server/subtitles";
import { transcribeAudioFileWithDeepgram } from "./deepgram-transcription";
import { runOmniFfmpeg, runOmniFfprobeDuration } from "./omni-ffmpeg";
import { uploadOmniVideoBufferToS3 } from "./omni-video-storage";
import { ensureOmniSchema } from "./schema";

export async function rebuildOmniReelSubtitles(input: {
  reelId: number;
  settings?: Partial<OmniSubtitleSettings> | null;
  forceTranscribe?: boolean;
}) {
  await ensureOmniSchema();
  const reel = await getOmniReel(input.reelId);
  if (!reel?.final_video_url) {
    throw new Error("Final video is not ready yet");
  }

  const settings = normalizeSettingsForRender(input.settings);
  const workdir = await mkdtemp(path.join(tmpdir(), `omni-reel-subtitles-${input.reelId}-`));

  try {
    const sourcePath = path.join(workdir, "source.mp4");
    const audioPath = path.join(workdir, "audio.wav");
    const outputPath = path.join(workdir, "subtitled.mp4");
    await downloadVideo(reel.final_video_url, sourcePath);
    const transcript = input.forceTranscribe
      ? await transcribeVideoAudio({ reelId: input.reelId, sourcePath, audioPath, settings })
      : await resolveTranscript({ reel, sourcePath, audioPath, settings });

    await updateSubtitleState(input.reelId, "rendering", {
      subtitles_settings: settings,
      subtitles_transcript: transcript,
    });

    const duration = await runOmniFfprobeDuration(sourcePath);
    const subtitleTrack = await materializeSubtitleTrack({
      settings,
      words: transcript.words,
      totalDuration: duration || Math.max(...transcript.words.map((word) => word.end)),
      workdir,
    });
    if (!subtitleTrack) throw new Error("Subtitle track was not created");

    await runOmniFfmpeg([
      "-y",
      "-i",
      sourcePath,
      "-vf",
      buildSubtitleFilter(subtitleTrack.subtitlePath, subtitleTrack.fontsDir),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      "-c:a",
      "copy",
      "-movflags",
      "+faststart",
      outputPath,
    ]);

    const subtitledUrl = await uploadSubtitledVideo(reel, outputPath);
    return updateSubtitleState(input.reelId, "completed", {
      subtitled_video_url: subtitledUrl,
      subtitles_error: null,
      subtitles_settings: settings,
    });
  } catch (error) {
    await updateSubtitleState(input.reelId, "failed", {
      subtitles_error: error instanceof Error ? error.message : "Subtitle render failed",
    }).catch(() => {});
    throw error;
  } finally {
    await rm(workdir, { recursive: true, force: true }).catch(() => {});
  }
}

async function resolveTranscript(input: {
  reel: OmniReel;
  sourcePath: string;
  audioPath: string;
  settings: OmniSubtitleSettings;
}) {
  const cached = normalizeCachedTranscript(input.reel.subtitles_transcript);
  if (cached) return cached;
  return transcribeVideoAudio({
    reelId: input.reel.id,
    sourcePath: input.sourcePath,
    audioPath: input.audioPath,
    settings: input.settings,
  });
}

async function transcribeVideoAudio(input: {
  reelId: number;
  sourcePath: string;
  audioPath: string;
  settings: OmniSubtitleSettings;
}) {
  await updateSubtitleState(input.reelId, "transcribing", {
    subtitles_settings: input.settings,
    subtitles_error: null,
  });
  await extractWavAudio(input.sourcePath, input.audioPath);
  const transcript = await transcribeAudioFileWithDeepgram(input.audioPath);
  if (!transcript.words.length) throw new Error("Deepgram returned no word timestamps");
  return {
    provider: "deepgram",
    model: "nova-3",
    transcript: transcript.transcript,
    words: transcript.words,
    word_count: transcript.words.length,
    updated_at: new Date().toISOString(),
  };
}

function normalizeCachedTranscript(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const payload = value as { transcript?: unknown; words?: unknown; updated_at?: unknown };
  const words = Array.isArray(payload.words) ? payload.words.filter(isWordTimestamp) : [];
  if (!words.length) return null;
  return {
    provider: "deepgram",
    model: "nova-3",
    transcript: typeof payload.transcript === "string" ? payload.transcript : "",
    words,
    word_count: words.length,
    updated_at: typeof payload.updated_at === "string" ? payload.updated_at : new Date().toISOString(),
  };
}

function isWordTimestamp(value: unknown): value is WordTimestamp {
  if (!value || typeof value !== "object") return false;
  const word = value as WordTimestamp;
  return typeof word.word === "string" && Number.isFinite(word.start) && Number.isFinite(word.end) && word.end > word.start;
}

function normalizeSettingsForRender(input?: Partial<OmniSubtitleSettings> | null) {
  const settings = normalizeOmniSubtitleSettings(input);
  const subtitleMarginPercent = marginPercentForSubtitlePosition(settings.position);
  return {
    ...settings,
    subtitle_margin_percent: subtitleMarginPercent,
    subtitle_margin_v: Math.round((subtitleMarginPercent / 100) * 1920),
  };
}

async function getOmniReel(reelId: number) {
  const { rows } = await pool.query<OmniReel>("SELECT * FROM omni_reels WHERE id = $1 LIMIT 1", [reelId]);
  return rows[0] || null;
}

async function updateSubtitleState(
  reelId: number,
  status: NonNullable<OmniReel["subtitles_status"]>,
  values: {
    subtitled_video_url?: string | null;
    subtitles_error?: string | null;
    subtitles_settings?: OmniSubtitleSettings | null;
    subtitles_transcript?: Record<string, unknown> | null;
  } = {}
) {
  const { rows } = await pool.query<OmniReel>(
    `UPDATE omni_reels
     SET subtitles_status = $2,
         subtitled_video_url = COALESCE($3, subtitled_video_url),
         subtitles_error = $4,
         subtitles_settings = COALESCE($5::jsonb, subtitles_settings),
         subtitles_transcript = COALESCE($6::jsonb, subtitles_transcript),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [
      reelId,
      status,
      values.subtitled_video_url ?? null,
      values.subtitles_error ?? null,
      values.subtitles_settings ? JSON.stringify(values.subtitles_settings) : null,
      values.subtitles_transcript ? JSON.stringify(values.subtitles_transcript) : null,
    ]
  );
  if (!rows[0]) throw new Error("Omni reel not found");
  return rows[0];
}

async function downloadVideo(url: string, destinationPath: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to download final video: ${response.status}`);
  }
  await writeFile(destinationPath, Buffer.from(await response.arrayBuffer()));
}

async function extractWavAudio(inputPath: string, outputPath: string) {
  await runOmniFfmpeg(["-y", "-i", inputPath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", outputPath]);
}

function buildSubtitleFilter(subtitlePath: string, fontsDir: string | null) {
  const source = `subtitles=${escapeFilterPath(subtitlePath)}`;
  return fontsDir ? `${source}:fontsdir=${escapeFilterPath(fontsDir)}` : source;
}

function escapeFilterPath(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

async function uploadSubtitledVideo(reel: OmniReel, outputPath: string) {
  const body = await readFile(outputPath);
  return uploadOmniVideoBufferToS3({
    projectId: reel.project_id,
    reelId: reel.id,
    fileName: `subtitled/reel_${reel.id}_subtitles.mp4`,
    body,
  });
}
