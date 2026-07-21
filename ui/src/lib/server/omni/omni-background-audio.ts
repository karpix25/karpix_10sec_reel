import { spawn } from "child_process";
import { writeFile } from "fs/promises";
import path from "path";
import { getAudioMoodLabel, normalizeAudioMood } from "@/lib/audio-library/moods";
import type { AudioTrack } from "@/lib/audio-library/types";
import { chooseAudioTrackForMood } from "@/lib/server/audio-library/tracks";
import { runOmniFfmpeg, runOmniFfprobeDuration } from "./omni-ffmpeg";

export type OmniBackgroundAudioResult =
  | {
      status: "completed";
      outputPath: string;
      track: AudioTrack;
      durationSeconds: number;
    }
  | {
      status: "skipped";
      outputPath: string;
      track: null;
      durationSeconds: number;
      reason: string;
    };

export async function mixBackgroundAudioForReel(input: {
  reelId: number;
  mood: unknown;
  sourceVideoPath: string;
  workdir: string;
}): Promise<OmniBackgroundAudioResult> {
  const durationSeconds = await runOmniFfprobeDuration(input.sourceVideoPath);
  const mood = normalizeAudioMood(input.mood);
  const track = await chooseAudioTrackForMood(mood);
  if (!track) {
    return {
      status: "skipped",
      outputPath: input.sourceVideoPath,
      track: null,
      durationSeconds,
      reason: `Нет активных аудиотреков для настроения ${getAudioMoodLabel(mood)}`,
    };
  }

  const audioPath = path.join(input.workdir, `background-audio-${track.id}`);
  const outputPath = path.join(input.workdir, `omni-reel-${input.reelId}-with-audio.mp4`);
  await downloadAudioTrack(track.file_url, audioPath);
  const sourceHasAudio = await hasAudioStream(input.sourceVideoPath);
  const filter = sourceHasAudio
    ? "[1:a]volume=0.18[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=0[aout]"
    : "[1:a]volume=0.22[aout]";

  await runOmniFfmpeg([
    "-y",
    "-i",
    input.sourceVideoPath,
    "-stream_loop",
    "-1",
    "-i",
    audioPath,
    "-filter_complex",
    filter,
    "-map",
    "0:v:0",
    "-map",
    "[aout]",
    "-t",
    String(Math.max(0.1, durationSeconds)),
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-shortest",
    "-movflags",
    "+faststart",
    outputPath,
  ]);

  return { status: "completed", outputPath, track, durationSeconds };
}

async function downloadAudioTrack(fileUrl: string, outputPath: string) {
  const response = await fetch(fileUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to download background audio: ${response.status}`);
  }
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
}

async function hasAudioStream(filePath: string) {
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "a",
      "-show_entries",
      "stream=index",
      "-of",
      "csv=p=0",
      filePath,
    ]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(`ffprobe audio stream check failed with code ${code}: ${stderr.slice(-1000)}`));
    });
  });
  return output.length > 0;
}
