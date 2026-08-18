import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-storyboard-versioned-storage-"));
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
      join(ui, "src/lib/server/omni/omni-storyboard-image-storage.ts"),
      join(ui, "src/lib/server/omni/omni-video-storage.ts"),
      join(ui, "src/lib/omni/types.ts"),
    ],
  }));
  stubModule("@/lib/db", "module.exports = {};");
  stubModule("@/lib/server/s3-storage", "module.exports = { getS3Config() { return {}; }, putObjectToS3(_config, key) { (global.__omniStoryboardObjectKeys ||= []).push(key); return 'https://s3.example/' + key; } };");
  stubModule("@/lib/server/yandex-disk", "module.exports = { isYandexDiskConfigured() { return false; }, uploadVideoFileToYandexFolder() {} };");
  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", tsconfig], { cwd: ui, stdio: "inherit" });

  global.__omniStoryboardObjectKeys = [];
  const { uploadVersionedStoryboardImage } = require(findFile(compiled, "omni-storyboard-image-storage.js"));
  const base = {
    projectId: 6,
    scriptId: 22,
    segmentIndex: 1,
    generationAttemptCount: 1,
    body: Buffer.from("storyboard"),
    contentType: "image/jpeg",
  };
  const first = await uploadVersionedStoryboardImage({ ...base, generationToken: "kie-task/first" });
  const second = await uploadVersionedStoryboardImage({ ...base, generationToken: "kie-task-second" });

  assert.notEqual(first, second, "different generation tokens must create different immutable URLs");
  assert.deepEqual(global.__omniStoryboardObjectKeys, [
    "omni/omni-videos/project-6/generated-script-22/storyboard/frames/01_storyboard_01_attempt_01_kie-task_first.jpeg",
    "omni/omni-videos/project-6/generated-script-22/storyboard/frames/01_storyboard_01_attempt_01_kie-task-second.jpeg",
  ]);
  console.log("Versioned storyboard image storage checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function stubModule(name, code) {
  const target = join(output, "node_modules", ...name.split("/")) + ".js";
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, code);
}

function findFile(dir, fileName) {
  const path = execFileSync("find", [dir, "-name", fileName], { encoding: "utf8" }).trim().split("\n")[0];
  if (!path) throw new Error(`Compiled file not found: ${fileName}`);
  return path;
}
