import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import pool from "@/lib/db";
import { normalizeAudioMood, type AudioMood } from "@/lib/audio-library/moods";
import type { AudioTrack } from "@/lib/audio-library/types";
import { getS3Config, putObjectToS3 } from "@/lib/server/s3-storage";
import { runOmniFfprobeDuration } from "@/lib/server/omni/omni-ffmpeg";
import { ensureAudioLibrarySchema } from "./schema";

const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

function normalizeTrack(row: AudioTrack): AudioTrack {
  return {
    ...row,
    mood: normalizeAudioMood(row.mood),
    duration_seconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
    play_count: Number(row.play_count || 0),
  };
}

function sanitizeFileName(value: string) {
  return value
    .replace(/[\\/<>:"|?*\u0000-\u001f]+/g, "_")
    .replace(/\s+/g, "_")
    .trim()
    .slice(0, 160);
}

export async function listAudioTracks() {
  await ensureAudioLibrarySchema();
  const { rows } = await pool.query<AudioTrack>(
    `SELECT *
     FROM audio_tracks
     WHERE status <> 'archived'
     ORDER BY mood ASC, created_at DESC, id DESC`
  );
  return rows.map(normalizeTrack);
}

export async function uploadAudioTrack(input: {
  mood: unknown;
  title?: unknown;
  fileName: string;
  contentType: string;
  buffer: Buffer;
}) {
  await ensureAudioLibrarySchema();
  if (!input.contentType.startsWith("audio/")) {
    throw new Error("Можно загружать только аудиофайлы");
  }
  if (input.buffer.byteLength > MAX_AUDIO_BYTES) {
    throw new Error("Аудиофайл слишком большой. Максимум 50 МБ");
  }

  const mood = normalizeAudioMood(input.mood);
  const fileName = sanitizeFileName(input.fileName) || "audio.mp3";
  const title = String(input.title || "").trim() || fileName.replace(/\.[a-z0-9]+$/i, "");
  const durationSeconds = await probeAudioDuration(input.buffer, fileName);
  const storageKey = `audio-library/${mood}/${Date.now()}_${fileName}`;
  const fileUrl = await putObjectToS3(getS3Config(), storageKey, input.buffer, input.contentType);

  const { rows } = await pool.query<AudioTrack>(
    `INSERT INTO audio_tracks (
       mood,
       title,
       file_name,
       file_url,
       storage_key,
       content_type,
       duration_seconds,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
     RETURNING *`,
    [mood, title, fileName, fileUrl, storageKey, input.contentType, durationSeconds || null]
  );
  return normalizeTrack(rows[0]);
}

export async function archiveAudioTrack(trackId: number) {
  await ensureAudioLibrarySchema();
  const { rows } = await pool.query<AudioTrack>(
    `UPDATE audio_tracks
     SET status = 'archived',
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [trackId]
  );
  return rows[0] ? normalizeTrack(rows[0]) : null;
}

export async function chooseAudioTrackForMood(mood: unknown) {
  await ensureAudioLibrarySchema();
  const normalizedMood = normalizeAudioMood(mood);
  const selected = await selectTrack(normalizedMood);
  const track = selected || (normalizedMood === "serious" ? null : await selectTrack("serious")) || await selectAnyTrack();
  if (!track) return null;

  await pool.query(
    `UPDATE audio_tracks
     SET play_count = play_count + 1,
         last_used_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [track.id]
  );
  return track;
}

async function selectTrack(mood: AudioMood) {
  const { rows } = await pool.query<AudioTrack>(
    `SELECT *
     FROM audio_tracks
     WHERE mood = $1
       AND status = 'active'
     ORDER BY last_used_at ASC NULLS FIRST, play_count ASC, random()
     LIMIT 1`,
    [mood]
  );
  return rows[0] ? normalizeTrack(rows[0]) : null;
}

async function selectAnyTrack() {
  const { rows } = await pool.query<AudioTrack>(
    `SELECT *
     FROM audio_tracks
     WHERE status = 'active'
     ORDER BY last_used_at ASC NULLS FIRST, play_count ASC, random()
     LIMIT 1`
  );
  return rows[0] ? normalizeTrack(rows[0]) : null;
}

async function probeAudioDuration(buffer: Buffer, fileName: string) {
  const workdir = await mkdtemp(path.join(tmpdir(), "audio-track-"));
  const filePath = path.join(workdir, sanitizeFileName(fileName) || "audio.mp3");
  try {
    await writeFile(filePath, buffer);
    return await runOmniFfprobeDuration(filePath);
  } finally {
    await rm(workdir, { recursive: true, force: true }).catch(() => {});
  }
}
