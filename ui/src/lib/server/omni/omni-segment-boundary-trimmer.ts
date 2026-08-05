import { spawn } from "child_process";
import { runOmniFfmpeg, runOmniFfprobeDuration } from "./omni-ffmpeg";

const SILENCE_THRESHOLD_DB = -38;
const SILENCE_MIN_DURATION_SECONDS = 0.6;
const MIN_REMAINING_DURATION_SECONDS = 1;

export async function trimOmniSegmentBoundarySilence(input: {
  inputPath: string;
  outputPath: string;
}) {
  const duration = await runOmniFfprobeDuration(input.inputPath);
  if (!duration) return input.inputPath;

  let intervals: SilenceInterval[];
  try {
    intervals = await detectSilenceIntervals(input.inputPath);
  } catch {
    return input.inputPath;
  }
  const leading = intervals.find(
    (interval) => interval.start <= 0.05 && interval.end - interval.start >= SILENCE_MIN_DURATION_SECONDS
  );
  const trailing = [...intervals].reverse().find(
    (interval) => interval.end >= duration - 0.05 && interval.end - interval.start >= SILENCE_MIN_DURATION_SECONDS
  );
  const start = leading ? Math.min(leading.end, duration) : 0;
  const end = trailing ? Math.max(trailing.start, start) : duration;
  if ((start <= 0 && end >= duration) || end - start < MIN_REMAINING_DURATION_SECONDS) {
    return input.inputPath;
  }

  await runOmniFfmpeg([
    "-y",
    "-i",
    input.inputPath,
    "-ss",
    start.toFixed(3),
    "-t",
    (end - start).toFixed(3),
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    input.outputPath,
  ]);
  return input.outputPath;
}

type SilenceInterval = { start: number; end: number };

async function detectSilenceIntervals(filePath: string): Promise<SilenceInterval[]> {
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn("ffmpeg", [
      "-hide_banner",
      "-i",
      filePath,
      "-af",
      `silencedetect=noise=${SILENCE_THRESHOLD_DB}dB:d=${SILENCE_MIN_DURATION_SECONDS}`,
      "-f",
      "null",
      "-",
    ], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", () => resolve(stderr));
  });

  const intervals: SilenceInterval[] = [];
  let start: number | null = null;
  for (const match of output.matchAll(/silence_(start|end):\s*([0-9.]+)/g)) {
    const value = Number(match[2]);
    if (!Number.isFinite(value)) continue;
    if (match[1] === "start") {
      start = value;
    } else if (start !== null) {
      intervals.push({ start, end: value });
      start = null;
    }
  }
  return intervals;
}
