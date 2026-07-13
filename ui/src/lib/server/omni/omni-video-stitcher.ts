import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { spawn } from "child_process";

function safeConcatPath(filePath: string) {
  return filePath.replace(/'/g, "'\\''");
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
      reject(new Error(`ffmpeg failed with code ${code}: ${stderr.slice(-1600)}`));
    });
  });
}

export async function stitchOmniSegments(input: {
  reelId: number;
  segmentBuffers: Buffer[];
}) {
  if (!input.segmentBuffers.length) {
    throw new Error("No segment videos to stitch");
  }

  const workdir = await mkdtemp(path.join(tmpdir(), `omni-reel-${input.reelId}-`));

  try {
    const segmentPaths: string[] = [];
    for (let index = 0; index < input.segmentBuffers.length; index += 1) {
      const segmentPath = path.join(workdir, `segment-${String(index + 1).padStart(2, "0")}.mp4`);
      await writeFile(segmentPath, input.segmentBuffers[index]);
      segmentPaths.push(segmentPath);
    }

    const concatPath = path.join(workdir, "concat.txt");
    await writeFile(concatPath, segmentPaths.map((filePath) => `file '${safeConcatPath(filePath)}'`).join("\n"));
    const outputPath = path.join(workdir, `omni-reel-${input.reelId}.mp4`);

    await runFfmpeg([
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatPath,
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      outputPath,
    ]);

    return { outputPath, workdir };
  } catch (error) {
    await rm(workdir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}
