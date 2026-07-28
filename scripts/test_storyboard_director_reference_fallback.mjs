import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-storyboard-ref-fallback-"));
const compiled = join(output, "compiled");
const tsconfig = join(output, "tsconfig.json");
const require = createRequire(import.meta.url);

try {
  writeFileSync(tsconfig, JSON.stringify({
    compilerOptions: {
      target: "es2022",
      module: "commonjs",
      moduleResolution: "node",
      baseUrl: join(ui, "src"),
      paths: { "@/*": ["*"] },
      rootDir: join(ui, "src"),
      outDir: compiled,
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
    },
    include: [
      join(ui, "src/lib/server/omni/storyboard-director-references.ts"),
      join(ui, "src/lib/omni/types.ts"),
    ],
  }));

  stubModule("@/lib/db", "module.exports = {};");
  stubModule("@/lib/server/s3-storage", "module.exports = { getS3Config() { return {}; }, putObjectToS3() { throw new Error('upload should not run'); } };");
  stubModule("@/lib/server/yandex-disk", "module.exports = { isYandexDiskConfigured() { return false; }, uploadVideoFileToYandexFolder() {} };");

  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", tsconfig], { cwd: ui, stdio: "inherit" });

  global.fetch = async () => ({
    ok: false,
    status: 403,
    headers: { get: () => "" },
    arrayBuffer: async () => new ArrayBuffer(0),
  });

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message, details) => warnings.push({ message, details });

  try {
    const { prepareSegmentStoryboardDirectorReferenceUrls } = require(findFile(compiled, "storyboard-director-references.js"));
    const segments = [{ index: 1, durationSeconds: 10 }, { index: 2, durationSeconds: 10 }];
    const storageTarget = { kind: "reel", projectId: 1, reelId: 2 };
    const fallbackUrl = "https://cdn.example.com/fallback.jpg";

    const bySegment = await prepareSegmentStoryboardDirectorReferenceUrls({
      sourceSnapshot: {
        director_video_url: "https://cdn.example.com/expired.mp4",
        director_reference_image_urls: [fallbackUrl],
      },
      storageTarget,
      segments,
    });

    assert.deepEqual(bySegment.get(1), [fallbackUrl]);
    assert.deepEqual(bySegment.get(2), [fallbackUrl]);
    assert.match(warnings[0].message, /Segment storyboard director reference frame extraction failed/u);

    const emptyFallback = await prepareSegmentStoryboardDirectorReferenceUrls({
      sourceSnapshot: { director_video_url: "https://cdn.example.com/expired.mp4" },
      storageTarget,
      segments,
    });
    assert.deepEqual(emptyFallback.get(1), []);
    assert.deepEqual(emptyFallback.get(2), []);
  } finally {
    console.warn = originalWarn;
  }

  console.log("Storyboard director reference fallback checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function stubModule(name, code) {
  const target = join(output, "node_modules", ...name.split("/")) + ".js";
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, code);
}

function findFile(dir, fileName) {
  const entries = execFileSync("find", [dir, "-name", fileName], { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean);
  if (!entries[0]) throw new Error(`Compiled file not found: ${fileName}`);
  return entries[0];
}
