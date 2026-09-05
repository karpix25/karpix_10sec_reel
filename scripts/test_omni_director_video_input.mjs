import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { createRequire, Module } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const directory = mkdtempSync(join(tmpdir(), "omni-director-video-test-"));
const require = createRequire(import.meta.url);
const originalFetch = globalThis.fetch;
const originalLoad = Module._load;
let storageReady = true;
let uploaded = null;
try {
  writeFileSync(join(directory, "tsconfig.json"), JSON.stringify({ compilerOptions: {
    outDir: join(directory, "compiled"), module: "commonjs", target: "es2022", baseUrl: ui,
    paths: { "@/*": ["src/*"] }, skipLibCheck: true, esModuleInterop: true, moduleResolution: "node",
    types: ["node"], typeRoots: [join(ui, "node_modules/@types")],
  }, files: [join(ui, "src/lib/server/omni/director-analysis-video-input.ts")] }));
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", join(directory, "tsconfig.json")], { stdio: "inherit" });
  Module._load = function (request, parent, isMain) {
    if (request === "@/lib/server/s3-storage") return {
      getS3Config: () => ({}), isS3Configured: () => storageReady,
      putObjectToS3: async (_config, _key, body) => { uploaded = body; return "https://test.invalid/analysis.mp4"; },
    };
    if (request === "./omni-storage-path") return { buildOmniStorageKey: (key) => key };
    return originalLoad.call(this, request, parent, isMain);
  };
  const helper = require(findFile(join(directory, "compiled"), "director-analysis-video-input.js"));
  Module._load = originalLoad;
  const response = (body, headers = {}) => new Response(body, { headers: { "content-type": "video/mp4", ...headers } });
  globalThis.fetch = async () => response(Buffer.alloc(8));
  assert.equal(await helper.prepareDirectorAnalysisVideoUrl("https://test.invalid/original.mp4"), "https://test.invalid/original.mp4");
  assert.equal(uploaded, null, "small originals do not need another storage copy");
  await assert.rejects(() => helper.readDirectorAnalysisVideo(response("bad", { "content-type": "text/html" })), /не видео/u);
  await assert.rejects(() => helper.readDirectorAnalysisVideo(response(null, { "content-length": String(81 * 1024 * 1024) })), /80 МиБ/u);
  const chunked = new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array(40 * 1024 * 1024));
    controller.enqueue(new Uint8Array(41 * 1024 * 1024));
    controller.close();
  } });
  await assert.rejects(() => helper.readDirectorAnalysisVideo(response(chunked, { "content-length": "1" })), /80 МиБ/u,
    "lying or absent content-length must not bypass the streaming bound");
  globalThis.fetch = async () => response(Buffer.alloc(helper.DIRECTOR_ANALYSIS_MAX_BYTES + 1));
  storageReady = false;
  await assert.rejects(() => helper.prepareDirectorAnalysisVideoUrl("https://test.invalid/large.mp4"), /настройте S3/u);
  storageReady = true;
  await assert.rejects(() => helper.prepareDirectorAnalysisVideoUrl("https://test.invalid/invalid.mp4"), /Запрос модели не отправлен/u);
  assert.equal(uploaded, null, "invalid source is never uploaded as an analysis proxy");

  // Real local ffmpeg conversion; no provider requests and no network storage.
  const source = join(directory, "source.mp4");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=24",
    "-f", "lavfi", "-i", "sine=frequency=440", "-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", source]);
  const oversized = Buffer.concat([readFileSync(source), Buffer.alloc(helper.DIRECTOR_ANALYSIS_MAX_BYTES)]);
  globalThis.fetch = async () => response(oversized);
  assert.equal(await helper.prepareDirectorAnalysisVideoUrl("https://test.invalid/original.mp4"), "https://test.invalid/analysis.mp4");
  assert.ok(uploaded.length > 0 && uploaded.length <= helper.DIRECTOR_ANALYSIS_MAX_BYTES);
  const proxy = join(directory, "proxy.mp4");
  writeFileSync(proxy, uploaded);
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width:format=duration", "-of", "json", proxy], { encoding: "utf8" }));
  assert.ok(Math.abs(Number(probe.format.duration) - 2) < 0.2, "proxy preserves original timeline");
  assert.ok(probe.streams.some((stream) => stream.codec_type === "audio"), "proxy preserves source speech/audio");
  assert.ok(probe.streams.find((stream) => stream.codec_type === "video").width <= 720);
  console.log("Director video input size/proxy checks passed");
} finally {
  globalThis.fetch = originalFetch;
  Module._load = originalLoad;
  rmSync(directory, { recursive: true, force: true });
}

function findFile(base, name) {
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    const path = join(base, entry.name);
    if (entry.isFile() && entry.name === name) return path;
    if (entry.isDirectory()) { const match = findFile(path, name); if (match) return match; }
  }
}
