import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-background-audio-"));
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
    include: [join(ui, "src/lib/audio-library/**/*.ts")],
  }));

  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", tsconfig], { cwd: ui, stdio: "inherit" });

  const {
    AUDIO_MOODS,
    AUDIO_MOOD_OPTIONS,
    detectAudioMoodFromText,
    getAudioMoodLabel,
    normalizeAudioMood,
  } = require(findFile(compiled, "moods.js"));

  assert.deepEqual(AUDIO_MOODS, ["energetic", "calm", "dramatic", "inspiring", "playful", "serious"]);
  assert.equal(AUDIO_MOOD_OPTIONS.length, 6);
  assert.equal(normalizeAudioMood("calm"), "calm");
  assert.equal(normalizeAudioMood("unknown"), "serious");
  assert.equal(getAudioMoodLabel("energetic"), "Энергично");
  assert.equal(detectAudioMoodFromText("Срочно нужен быстрый запуск и рост продаж"), "energetic");
  assert.equal(detectAudioMoodFromText("Спокойный уход и мягкая рутина для сна"), "calm");
  assert.equal(detectAudioMoodFromText("Разбор фактов и экспертная система"), "serious");

  console.log("Omni background audio contract checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function findFile(dir, fileName) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const filePath = join(dir, entry.name);
    if (entry.isDirectory()) {
      try {
        return findFile(filePath, fileName);
      } catch {
        continue;
      }
    }
    if (entry.name === fileName) return filePath;
  }
  throw new Error(`Could not find ${fileName} in ${dir}`);
}
