import { spawn } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import sharp from "sharp";
import { uploadKieImageBuffer } from "./kie-file-upload-client";
import { uploadOmniImageBufferToS3 } from "./omni-video-storage";

const FRAME_CONTENT_TYPE = "image/jpeg";
const DARK_FRAME_AVERAGE_THRESHOLD = 12;

export type ContinuityFrameAsset = {
  sourceSegmentId: number;
  sourceSegmentIndex: number;
  sourceFrameUrl: string;
  kieFrameUrl: string | null;
  kieUploadPayload: Record<string, unknown> | null;
};

export async function createContinuityFrameAsset(input: {
  projectId: number;
  reelId: number;
  sourceSegmentId: number;
  sourceSegmentIndex: number;
  videoBuffer: Buffer;
  uploadForKie: boolean;
}): Promise<ContinuityFrameAsset> {
  const frameBuffer = await extractLastFrame(input.videoBuffer, input.reelId, input.sourceSegmentIndex);
  const fileName = buildContinuityFrameFileName(input.sourceSegmentIndex);
  const sourceFrameUrl = await uploadOmniImageBufferToS3({
    projectId: input.projectId,
    reelId: input.reelId,
    segmentIndex: input.sourceSegmentIndex,
    fileName,
    body: frameBuffer,
    contentType: FRAME_CONTENT_TYPE,
  });
  const kieUpload = input.uploadForKie
    ? await uploadKieContinuityFrameBuffer({
        body: frameBuffer,
        fileName,
      })
    : null;

  return {
    sourceSegmentId: input.sourceSegmentId,
    sourceSegmentIndex: input.sourceSegmentIndex,
    sourceFrameUrl,
    kieFrameUrl: kieUpload?.url || null,
    kieUploadPayload: kieUpload?.raw || null,
  };
}

export async function uploadKieContinuityFrameFromUrl(input: {
  frameUrl: string;
  sourceSegmentIndex: number;
}) {
  const response = await fetch(input.frameUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load continuity frame for KIE upload: ${response.status}`);
  }
  const contentType = response.headers.get("content-type") || FRAME_CONTENT_TYPE;
  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error(`Continuity frame URL is not an image: ${contentType}`);
  }

  return uploadKieContinuityFrameBuffer({
    body: Buffer.from(await response.arrayBuffer()),
    fileName: buildContinuityFrameFileName(input.sourceSegmentIndex),
    mimeType: contentType,
  });
}

async function uploadKieContinuityFrameBuffer(input: {
  body: Buffer;
  fileName: string;
  mimeType?: string;
}) {
  return uploadKieImageBuffer({
    body: input.body,
    fileName: input.fileName,
    mimeType: input.mimeType || FRAME_CONTENT_TYPE,
    uploadPath: "omni/continuity-frames",
  });
}

async function extractLastFrame(videoBuffer: Buffer, reelId: number, segmentIndex: number) {
  const workdir = await mkdtemp(path.join(tmpdir(), `omni-frame-${reelId}-${segmentIndex}-`));
  const videoPath = path.join(workdir, "segment.mp4");
  const outputPath = path.join(workdir, "last-frame.jpg");

  try {
    await writeFile(videoPath, videoBuffer);
    return await extractUsableEndFrame(videoPath, outputPath);
  } catch {
    return extractFirstFrame(videoPath, outputPath);
  } finally {
    await rm(workdir, { recursive: true, force: true }).catch(() => {});
  }
}

async function extractUsableEndFrame(videoPath: string, outputPath: string) {
  let lastFrame: Buffer | null = null;
  let lastError: unknown = null;

  for (const offset of ["-0.15", "-0.35", "-0.75"]) {
    try {
      await runFfmpeg([
        "-y",
        "-sseof",
        offset,
        "-i",
        videoPath,
        "-frames:v",
        "1",
        "-q:v",
        "2",
        outputPath,
      ]);
      lastFrame = await readFile(outputPath);
      if (await isUsableContinuityFrame(lastFrame)) return lastFrame;
    } catch (error) {
      lastError = error;
    }
  }

  try {
    return await extractFirstFrame(videoPath, outputPath);
  } catch {
    if (lastFrame) return lastFrame;
    if (lastError instanceof Error) throw lastError;
    throw new Error("Could not extract a usable continuity frame");
  }
}

async function extractFirstFrame(videoPath: string, outputPath: string) {
  await runFfmpeg(["-y", "-i", videoPath, "-frames:v", "1", "-q:v", "2", outputPath]);
  return readFile(outputPath);
}

async function isUsableContinuityFrame(frame: Buffer) {
  const pixels = await sharp(frame)
    .resize(32, 32, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer();
  const average = pixels.reduce((sum, value) => sum + value, 0) / Math.max(1, pixels.length);
  return average >= DARK_FRAME_AVERAGE_THRESHOLD;
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
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg frame extraction failed with code ${code}: ${stderr.slice(-1600)}`));
    });
  });
}

function buildContinuityFrameFileName(segmentIndex: number) {
  return `segment_${String(segmentIndex).padStart(2, "0")}_last_frame.jpg`;
}
