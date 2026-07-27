import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-yandex-storage-"));
const compiled = join(output, "compiled");
const require = createRequire(import.meta.url);
const tsconfig = join(output, "tsconfig.json");

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
      join(ui, "src/lib/server/omni/omni-video-storage.ts"),
      join(ui, "src/lib/omni/types.ts"),
    ],
  }));

  stubModule("@/lib/db", "module.exports = {};");
  stubModule("@/lib/server/s3-storage", "module.exports = { getS3Config() { return {}; }, putObjectToS3() {} };");
  stubModule("@/lib/server/yandex-disk", "module.exports = { isYandexDiskConfigured() { return false; }, uploadVideoFileToYandexFolder() {} };");

  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", tsconfig], { cwd: ui, stdio: "inherit" });

  const storage = require(findFile(compiled, "omni-video-storage.js"));
  assert.equal(
    storage.buildDefaultOmniYandexFolder({
      project: { name: "Коллаген / Brand" },
      product: { name: "Апельсиновый: коллаген" },
    }),
    "disk:/ВИДЕО/Коллаген Brand/avatar/Апельсиновый коллаген/omni"
  );
  assert.match(
    storage.buildOmniVideoFileName({
      project: { name: "Коллаген / Brand" },
      product: { name: "Апельсиновый: коллаген" },
      reelId: 42,
    }),
    /^Коллаген_Brand_Апельсиновый_коллаген_reel_42_\d{14}\.mp4$/u
  );

  console.log("Omni Yandex storage contract checks passed");
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
