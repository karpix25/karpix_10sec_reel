import { spawn } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import {
  uploadOmniGeneratedScriptStoryboardImageBufferToS3,
  uploadOmniImageBufferToS3,
} from "./omni-video-storage";
import { extractDirectorReferenceImageUrls } from "./director-reference-images";
import { extractDirectorReferenceVideoUrl } from "./director-reference-video-url";
import { transcribeAudioFileWithDeepgram } from "./deepgram-transcription";
import {
  STORYBOARD_REFERENCE_FRAMES_PER_SEGMENT,
  buildSegmentReferenceSeekSeconds,
  buildSegmentReferenceSeekSecondsFromWords,
  readSourceDurationSeconds,
  type StoryboardReferenceSegment,
} from "./storyboard-reference-frame-timing";

const DEFAULT_MAX_REFERENCE_FRAMES = STORYBOARD_REFERENCE_FRAMES_PER_SEGMENT;
const DEFAULT_MAX_VIDEO_MB = 120;
const REFERENCE_VIDEO_DOWNLOAD_ATTEMPTS = 3;
const REFERENCE_VIDEO_REQUEST_TIMEOUT_MS = 60_000;
const SEEK_SECONDS = [0.4, 2.2, 4.5, 6.5, 8.5] as const;

type StorageTarget =
  | { kind: "reel"; projectId: number; reelId: number }
  | { kind: "generated_script"; projectId: number; scriptId: number };

export async function prepareStoryboardDirectorReferenceUrls(input: {
  directorAnalysis?: Parameters<typeof extractDirectorReferenceImageUrls>[0]["directorAnalysis"];
  sourceSnapshot?: unknown;
  directorVideoUrl?: string | null;
  storageTarget: StorageTarget;
  maxFrames?: number;
}) {
  const maxFrames = input.maxFrames || DEFAULT_MAX_REFERENCE_FRAMES;
  const directImageUrls = extractDirectorReferenceImageUrls({
    directorAnalysis: input.directorAnalysis,
    sourceSnapshot: input.sourceSnapshot,
    limit: maxFrames,
  });
  if (directImageUrls.length >= maxFrames) return directImageUrls;

  const videoUrl = cleanUrl(input.directorVideoUrl) || extractDirectorReferenceVideoUrl(input.sourceSnapshot);
  if (!videoUrl) return directImageUrls;

  try {
    const frameBuffers = await extractFramesFromVideoUrl(videoUrl, maxFrames - directImageUrls.length);
    const uploaded = [];
    for (let index = 0; index < frameBuffers.length; index += 1) {
      uploaded.push(await uploadDirectorReferenceFrame({
        storageTarget: input.storageTarget,
        frameIndex: directImageUrls.length + index + 1,
        body: frameBuffers[index],
      }));
    }
    return uniqueUrls([...directImageUrls, ...uploaded]).slice(0, maxFrames);
  } catch (error) {
    console.warn("Storyboard director reference frame extraction failed:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return directImageUrls;
  }
}

export async function prepareSegmentStoryboardDirectorReferenceUrls(input: {
  directorAnalysis?: Parameters<typeof extractDirectorReferenceImageUrls>[0]["directorAnalysis"];
  sourceSnapshot?: unknown;
  directorVideoUrl?: string | null;
  storageTarget: StorageTarget;
  segments: readonly StoryboardReferenceSegment[];
  framesPerSegment?: number;
}) {
  const framesPerSegment = input.framesPerSegment || STORYBOARD_REFERENCE_FRAMES_PER_SEGMENT;
  const bySegment = new Map<number, string[]>();
  if (!input.segments.length) return bySegment;

  const videoUrl = cleanUrl(input.directorVideoUrl) || extractDirectorReferenceVideoUrl(input.sourceSnapshot);
  if (videoUrl) {
    try {
      const sourceDurationSeconds = readSourceDurationSeconds(input.sourceSnapshot);
      const videoBuffer = await downloadVideoBuffer(videoUrl);
      let transcriptWords = null;
      try {
        transcriptWords = await transcribeReferenceVideo(videoBuffer);
      } catch (error) {
        console.warn("Reference video transcription unavailable; using legacy frame timing:", {
          error: formatError(error),
        });
      }
      for (const segment of input.segments) {
        const transcriptSeekSeconds = transcriptWords?.length
          ? buildSegmentReferenceSeekSecondsFromWords({
              segment,
              segments: input.segments,
              words: transcriptWords,
              framesPerSegment,
            })
          : [];
        const seekSeconds = transcriptSeekSeconds.length
          ? transcriptSeekSeconds
          : buildSegmentReferenceSeekSeconds({
              segment,
              segments: input.segments,
              sourceDurationSeconds,
              framesPerSegment,
            });
        const frameBuffers = await extractFramesFromVideoBuffer(videoBuffer, framesPerSegment, seekSeconds);
        const uploaded = [];
        for (let index = 0; index < frameBuffers.length; index += 1) {
          uploaded.push(await uploadDirectorReferenceFrame({
            storageTarget: input.storageTarget,
            segmentIndex: segment.index,
            frameIndex: index + 1,
            body: frameBuffers[index],
          }));
        }
        bySegment.set(segment.index, uniqueUrls(uploaded).slice(0, framesPerSegment));
      }
      return bySegment;
    } catch (error) {
      console.warn("Segment storyboard director reference frame extraction failed:", {
        error: formatError(error),
      });
    }
  }

  return buildSegmentFallbackReferenceUrls({ ...input, framesPerSegment });
}

function buildSegmentFallbackReferenceUrls(input: {
  directorAnalysis?: Parameters<typeof extractDirectorReferenceImageUrls>[0]["directorAnalysis"];
  sourceSnapshot?: unknown;
  segments: readonly StoryboardReferenceSegment[];
  framesPerSegment: number;
}) {
  const fallbackUrls = extractDirectorReferenceImageUrls({
    directorAnalysis: input.directorAnalysis,
    sourceSnapshot: input.sourceSnapshot,
    limit: input.framesPerSegment,
  });
  const bySegment = new Map<number, string[]>();
  for (const segment of input.segments) bySegment.set(segment.index, fallbackUrls);
  return bySegment;
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function extractFramesFromVideoUrl(videoUrl: string, maxFrames: number, seekSeconds: readonly number[] = SEEK_SECONDS) {
  if (maxFrames <= 0) return [];
  const videoBuffer = await downloadVideoBuffer(videoUrl);
  return extractFramesFromVideoBuffer(videoBuffer, maxFrames, seekSeconds);
}

async function extractFramesFromVideoBuffer(videoBuffer: Buffer, maxFrames: number, seekSeconds: readonly number[] = SEEK_SECONDS) {
  if (maxFrames <= 0) return [];
  const workdir = await mkdtemp(path.join(tmpdir(), "omni-director-ref-"));
  const videoPath = path.join(workdir, "reference-video.mp4");

  try {
    await writeFile(videoPath, videoBuffer);
    const frames: Buffer[] = [];
    for (const seek of seekSeconds) {
      if (frames.length >= maxFrames) break;
      const outputPath = path.join(workdir, `frame-${frames.length + 1}.jpg`);
      try {
        await runFfmpeg(["-y", "-ss", String(seek), "-i", videoPath, "-frames:v", "1", "-q:v", "2", outputPath]);
        frames.push(await readFile(outputPath));
      } catch {
        if (seek !== seekSeconds[0]) continue;
        await runFfmpeg(["-y", "-i", videoPath, "-frames:v", "1", "-q:v", "2", outputPath]);
        frames.push(await readFile(outputPath));
      }
    }
    while (frames.length > 0 && frames.length < maxFrames) {
      frames.push(Buffer.from(frames[frames.length - 1]));
    }
    return frames;
  } finally {
    await rm(workdir, { recursive: true, force: true }).catch(() => {});
  }
}

async function transcribeReferenceVideo(videoBuffer: Buffer) {
  const workdir = await mkdtemp(path.join(tmpdir(), "omni-director-transcript-"));
  const videoPath = path.join(workdir, "reference-video.mp4");
  const audioPath = path.join(workdir, "reference-audio.wav");

  try {
    await writeFile(videoPath, videoBuffer);
    await runFfmpeg([
      "-y",
      "-i",
      videoPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      audioPath,
    ]);
    const transcript = await transcribeAudioFileWithDeepgram(audioPath);
    if (!transcript.words.length) throw new Error("Deepgram returned no reference video word timestamps");
    return transcript.words;
  } finally {
    await rm(workdir, { recursive: true, force: true }).catch(() => {});
  }
}

async function downloadVideoBuffer(videoUrl: string) {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= REFERENCE_VIDEO_DOWNLOAD_ATTEMPTS; attempt += 1) {
    try {
      const body = await tryDownloadVideoBuffer(videoUrl);
      validateReferenceVideoBuffer(videoUrl, body);
      return body;
    } catch (error) {
      lastError = error;
      if (attempt < REFERENCE_VIDEO_DOWNLOAD_ATTEMPTS) await sleep(350 * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function tryDownloadVideoBuffer(videoUrl: string) {
  const response = await fetch(videoUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(REFERENCE_VIDEO_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`reference video download failed for ${videoUrl}: ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (contentType && !isReferenceVideoContentType(contentType)) {
    throw new Error(`reference video URL did not return video for ${videoUrl}: ${contentType}`);
  }
  const contentLength = Number(response.headers.get("content-length") || 0);
  const maxBytes = getMaxVideoBytes();
  if (contentLength > maxBytes) {
    throw new Error(`reference video is too large for frame extraction: ${contentLength} bytes`);
  }
  const body = Buffer.from(await response.arrayBuffer());
  if (contentLength > 0 && body.length !== contentLength) {
    throw new Error(`reference video download was incomplete for ${videoUrl}: ${body.length}/${contentLength} bytes`);
  }
  if (body.length > maxBytes) {
    throw new Error(`reference video is too large for frame extraction: ${body.length} bytes`);
  }
  return body;
}

function validateReferenceVideoBuffer(videoUrl: string, body: Buffer) {
  if (body.length < 16) {
    throw new Error(`reference video download is too small for ${videoUrl}: ${body.length} bytes`);
  }
  if (!body.subarray(4, 8).equals(Buffer.from("ftyp"))) {
    const preview = body.subarray(0, 32).toString("utf8").replace(/\s+/gu, " ").trim();
    throw new Error(`reference video download is not an mp4 for ${videoUrl}: ${preview || "empty body"}`);
  }
}

function isReferenceVideoContentType(contentType: string) {
  const normalized = contentType.toLowerCase();
  return normalized.startsWith("video/") || normalized.includes("octet-stream");
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function uploadDirectorReferenceFrame(input: {
  storageTarget: StorageTarget;
  segmentIndex?: number;
  frameIndex: number;
  body: Buffer;
}) {
  const fileName = `director_reference_frame_${String(input.frameIndex).padStart(2, "0")}.jpg`;
  if (input.storageTarget.kind === "reel") {
    return uploadOmniImageBufferToS3({
      projectId: input.storageTarget.projectId,
      reelId: input.storageTarget.reelId,
      fileName,
      body: input.body,
      contentType: "image/jpeg",
      segmentIndex: input.segmentIndex,
    });
  }
  return uploadOmniGeneratedScriptStoryboardImageBufferToS3({
    projectId: input.storageTarget.projectId,
    scriptId: input.storageTarget.scriptId,
    segmentIndex: input.segmentIndex || 0,
    fileName,
    body: input.body,
    contentType: "image/jpeg",
  });
}

async function runFfmpeg(args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg reference frame extraction failed with code ${code}: ${stderr.slice(-1600)}`));
    });
  });
}

function cleanUrl(value: string | null | undefined) {
  return typeof value === "string" && isHttpUrl(value) ? value.trim() : null;
}

function isHttpUrl(value: string) {
  return /^https?:\/\//iu.test(value.trim());
}

function uniqueUrls(values: readonly string[]) {
  return [...new Set(values.map((url) => url.trim()).filter(Boolean))];
}

function getMaxVideoBytes() {
  const configuredMb = Number(process.env.OMNI_DIRECTOR_REFERENCE_MAX_VIDEO_MB || DEFAULT_MAX_VIDEO_MB);
  const mb = Number.isFinite(configuredMb) && configuredMb > 0 ? configuredMb : DEFAULT_MAX_VIDEO_MB;
  return mb * 1024 * 1024;
}
