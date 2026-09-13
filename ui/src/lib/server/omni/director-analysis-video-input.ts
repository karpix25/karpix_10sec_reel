import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { getS3Config, isS3Configured, putObjectToS3 } from "@/lib/server/s3-storage";
import { buildOmniStorageKey } from "./omni-storage-path";

// Observed provider fetch ceiling. Keep the analysis copy below it, never replace the original.
export const DIRECTOR_ANALYSIS_MAX_BYTES = 15 * 1024 * 1024;
const MAX_SOURCE_BYTES = 80 * 1024 * 1024;
const exec = promisify(execFile);

export async function prepareDirectorAnalysisVideoUrl(videoUrl: string): Promise<string> {
  const response = await fetch(videoUrl, { cache: "no-store", signal: AbortSignal.timeout(90_000) });
  if (!response.ok) throw new Error(`Reference analysis video download failed: HTTP ${response.status}`);
  const body = await readDirectorAnalysisVideo(response);
  if (body.length <= DIRECTOR_ANALYSIS_MAX_BYTES) return videoUrl;
  const config = getS3Config();
  if (!isS3Configured(config)) {
    throw new Error("Референс превышает 15 МиБ: настройте S3 для уменьшенной копии анализа или загрузите видео меньшего размера. Запрос модели не отправлен.");
  }
  const directory = await mkdtemp(join(tmpdir(), "omni-analysis-video-"));
  try {
    const source = join(directory, "source.mp4");
    const target = join(directory, "analysis.mp4");
    await writeFile(source, body);
    const duration = await probeDuration(source);
    const videoBitrate = Math.floor((13 * 1024 * 1024 * 8) / duration - 64_000);
    if (videoBitrate < 300_000) throw new Error("Видео слишком длинное для качественной копии анализа до 15 МиБ. Загрузите более короткий референс.");
    // execFile supplies the timeout that the shared, unbounded ffmpeg wrapper does not support.
    await exec("ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", source,
      "-map", "0:v:0", "-map", "0:a:0?", "-vf", "scale='min(720,iw)':-2",
      "-c:v", "libx264", "-preset", "fast", "-b:v", String(videoBitrate),
      "-maxrate", String(videoBitrate), "-bufsize", String(videoBitrate * 2),
      "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "64000", "-movflags", "+faststart", target,
    ], { timeout: 120_000, maxBuffer: 1024 * 1024 });
    const proxy = await readFile(target);
    if (!proxy.length || proxy.length > DIRECTOR_ANALYSIS_MAX_BYTES) {
      throw new Error("Уменьшенная копия всё ещё превышает 15 МиБ. Загрузите более короткий референс.");
    }
    const proxyDuration = await probeDuration(target);
    if (Math.abs(proxyDuration - duration) > Math.max(0.2, duration * 0.01)) {
      throw new Error("Длительность уменьшенной копии изменилась; анализ остановлен, чтобы сохранить тайминг референса.");
    }
    const key = buildOmniStorageKey(`omni-director-analysis-proxies/${createHash("sha256").update(body).digest("hex")}.mp4`);
    return await putObjectToS3(config, key, proxy, "video/mp4");
  } catch (error) {
    const message = error instanceof Error ? error.message : "неизвестная ошибка";
    // Avoid exposing ffmpeg command paths or signed source URLs in user-facing errors.
    if (/^(Видео слишком|Уменьшенная копия|Длительность уменьшенной)/u.test(message)) throw error;
    throw new Error("Не удалось подготовить копию анализа до 15 МиБ. Проверьте ffmpeg и S3 или загрузите видео меньшего размера. Запрос модели не отправлен.");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function readDirectorAnalysisVideo(response: Response): Promise<Buffer> {
  const contentType = response.headers.get("content-type") || "";
  if (contentType && !/^(video\/|application\/octet-stream)/iu.test(contentType)) {
    await response.body?.cancel();
    throw new Error("Источник референса вернул не видео. Запрос модели не отправлен.");
  }
  if (Number(response.headers.get("content-length")) > MAX_SOURCE_BYTES) {
    await response.body?.cancel();
    throw new Error("Референс превышает 80 МиБ. Загрузите видео меньшего размера для анализа.");
  }
  if (!response.body) throw new Error("Источник референса вернул пустое видео.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_SOURCE_BYTES) {
        await reader.cancel();
        throw new Error("Референс превышает 80 МиБ. Загрузите видео меньшего размера для анализа.");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!length) throw new Error("Источник референса вернул пустое видео.");
  return Buffer.concat(chunks, length);
}

async function probeDuration(file: string) {
  const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", file], { timeout: 30_000, maxBuffer: 1024 * 1024 });
  const duration = Number(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Invalid video duration");
  return duration;
}
