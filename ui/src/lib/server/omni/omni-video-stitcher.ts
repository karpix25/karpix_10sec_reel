import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { runOmniFfmpeg } from "./omni-ffmpeg";

function safeConcatPath(filePath: string) {
  return filePath.replace(/'/g, "'\\''");
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

    await runOmniFfmpeg([
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
