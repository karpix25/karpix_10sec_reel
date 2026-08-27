import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import pg from "pg";
import { analyzeSpeechDensity, normalizeTranscriptWords, summarizeResults } from "./omni-speech-density-metrics.mjs";

const { Pool } = pg;
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_RETRIES = 2;
const MAX_VIDEO_BYTES = 120 * 1024 * 1024;

function parseArgs(argv) {
  const options = { concurrency: DEFAULT_CONCURRENCY, retries: DEFAULT_RETRIES, limit: null, output: null };
  for (const argument of argv) {
    const [key, value] = argument.split("=", 2);
    if (key === "--concurrency") options.concurrency = Math.max(1, Math.min(8, Number(value) || DEFAULT_CONCURRENCY));
    if (key === "--retries") options.retries = Math.max(0, Math.min(4, Number(value) || DEFAULT_RETRIES));
    if (key === "--limit") options.limit = Math.max(1, Number(value) || 1);
    if (key === "--output") options.output = value || null;
  }
  return options;
}

function getRequiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function createPool() {
  return new Pool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || "postgres",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASS || process.env.DB_PASSWORD || "",
    max: 2,
    connectionTimeoutMillis: 15_000,
    query_timeout: 30_000,
  });
}

async function loadSegments(pool, limit) {
  const values = [];
  const limitClause = limit ? `LIMIT $${values.push(limit)}` : "";
  const { rows } = await pool.query(
    `SELECT
       s.id,
       s.reel_id,
       s.segment_index,
       s.duration_seconds AS planned_duration_seconds,
       s.voiceover_text,
       s.video_url,
       s.generation_provider,
       s.created_at
     FROM omni_reel_segments s
     WHERE s.status = 'completed'
       AND NULLIF(BTRIM(s.video_url), '') IS NOT NULL
       AND s.generation_provider = 'kie-ai'
     ORDER BY s.id
     ${limitClause}`,
    values,
  );
  return rows;
}

async function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve(stdout.trim());
      reject(new Error(`${command} failed with code ${code}: ${stderr.slice(-1_500)}`));
    });
  });
}

async function downloadVideo(url) {
  const response = await fetch(url, { cache: "no-store", redirect: "follow" });
  if (!response.ok) throw new Error(`video download failed: HTTP ${response.status}`);
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_VIDEO_BYTES) throw new Error(`video is larger than ${MAX_VIDEO_BYTES} bytes`);
  const body = Buffer.from(await response.arrayBuffer());
  if (!body.length || body.length > MAX_VIDEO_BYTES) throw new Error("video body is empty or too large");
  return body;
}

async function extractAudio(videoBuffer, workdir) {
  const videoPath = path.join(workdir, "source.mp4");
  const audioPath = path.join(workdir, "audio.wav");
  await writeFile(videoPath, videoBuffer);
  const duration = Number(await runCommand("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", videoPath,
  ]));
  await runCommand("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-i", videoPath,
    "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", audioPath,
  ]);
  return { durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : 0, audio: await readFile(audioPath) };
}

async function transcribeAudio(audio) {
  const url = new URL("https://api.deepgram.com/v1/listen");
  url.searchParams.set("model", process.env.OMNI_DENSITY_DEEPGRAM_MODEL || "nova-3");
  url.searchParams.set("language", "ru");
  url.searchParams.set("smart_format", "true");
  url.searchParams.set("punctuate", "true");
  url.searchParams.set("utterances", "true");
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Token ${getRequiredEnv("DEEPGRAM_API_KEY")}`, "Content-Type": "audio/wav" },
    body: audio,
  });
  if (!response.ok) {
    const details = await response.text();
    const error = new Error(`Deepgram HTTP ${response.status}: ${details.slice(0, 600)}`);
    error.retryable = response.status === 429 || response.status >= 500;
    throw error;
  }
  const payload = await response.json();
  const alternative = payload?.results?.channels?.[0]?.alternatives?.[0];
  return {
    transcript: String(alternative?.transcript || ""),
    words: normalizeTranscriptWords(alternative?.words || []),
  };
}

async function sleep(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function analyzeSegment(segment, retries) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const workdir = await mkdtemp(path.join(tmpdir(), `omni-density-${segment.id}-`));
    try {
      const video = await downloadVideo(segment.video_url);
      const extracted = await extractAudio(video, workdir);
      const transcript = await transcribeAudio(extracted.audio);
      const metrics = analyzeSpeechDensity({
        durationSeconds: extracted.durationSeconds || Number(segment.planned_duration_seconds),
        expectedVoiceover: segment.voiceover_text || "",
        words: transcript.words,
        frameSeconds: 2,
      });
      return {
        segmentId: segment.id,
        reelId: segment.reel_id,
        segmentIndex: segment.segment_index,
        generationProvider: segment.generation_provider,
        plannedDurationSeconds: Number(segment.planned_duration_seconds),
        actualDurationSeconds: Number((extracted.durationSeconds || Number(segment.planned_duration_seconds)).toFixed(3)),
        durationBucketSeconds: Math.round(extracted.durationSeconds || Number(segment.planned_duration_seconds)),
        expectedVoiceover: segment.voiceover_text || "",
        recognizedTranscript: transcript.transcript,
        metrics,
      };
    } catch (error) {
      lastError = error;
      if (!error?.retryable || attempt >= retries) break;
      await sleep(500 * 2 ** attempt);
    } finally {
      await rm(workdir, { recursive: true, force: true }).catch(() => {});
    }
  }
  return {
    segmentId: segment.id,
    reelId: segment.reel_id,
    segmentIndex: segment.segment_index,
    generationProvider: segment.generation_provider,
    plannedDurationSeconds: Number(segment.planned_duration_seconds),
    actualDurationSeconds: null,
    durationBucketSeconds: Math.round(Number(segment.planned_duration_seconds)),
    expectedVoiceover: segment.voiceover_text || "",
    recognizedTranscript: "",
    metrics: null,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  };
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runWorker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
  return results;
}

function buildReport(segments, results, options) {
  return {
    generatedAt: new Date().toISOString(),
    source: "omni_reel_segments",
    sourceFilter: "status=completed, generation_provider=kie-ai, video_url is present",
    transcription: { provider: "deepgram", model: process.env.OMNI_DENSITY_DEEPGRAM_MODEL || "nova-3", language: "ru" },
    measurement: { frameSeconds: 2, completeWordDefinition: "word.start >= frame.start and word.end <= frame.end" },
    options,
    inventory: { selectedSegments: segments.length, successfulSegments: results.filter((result) => result.metrics).length },
    summary: summarizeResults(results),
    results,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const database = createPool();
  try {
    const segments = await loadSegments(database, options.limit);
    if (!segments.length) throw new Error("No completed Google Omni segments with video_url found");
    console.error(`Auditing ${segments.length} Google Omni segments with Deepgram...`);
    const results = await mapWithConcurrency(segments, options.concurrency, async (segment, index) => {
      const result = await analyzeSegment(segment, options.retries);
      console.error(`[${index + 1}/${segments.length}] segment ${segment.id}: ${result.metrics ? "ok" : "failed"}`);
      return result;
    });
    const report = buildReport(segments, results, options);
    if (options.output) await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ ...report.summary, reportPath: options.output || null }));
  } finally {
    await database.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
