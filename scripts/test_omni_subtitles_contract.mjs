import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-subtitles-contract-"));
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
      types: ["node"],
      typeRoots: [join(ui, "node_modules/@types")],
    },
    include: [
      join(ui, "src/lib/subtitles.ts"),
      join(ui, "src/lib/omni/subtitle-settings.ts"),
      join(ui, "src/lib/server/omni/deepgram-transcription.ts"),
      join(ui, "src/types/index.ts"),
    ],
  }));

  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", tsconfig], { cwd: ui, stdio: "inherit" });
  linkAlias("lib/subtitles.js");

  const { normalizeOmniSubtitleSettings } = require(findFile(compiled, "subtitle-settings.js"));
  const { parseDeepgramTranscription } = require(findFile(compiled, "deepgram-transcription.js"));

  const settings = normalizeOmniSubtitleSettings({
    subtitle_mode: "word_by_word",
    subtitle_style_preset: "impact",
    subtitle_font_color: "not-a-color",
    subtitle_font_size: 999,
    subtitle_outline_width: -2,
    subtitle_margin_percent: 99,
  });
  assert.equal(settings.subtitles_enabled, true);
  assert.equal(settings.subtitle_mode, "word_by_word");
  assert.equal(settings.subtitle_style_preset, "impact");
  assert.equal(settings.subtitle_font_color, "#FFFFFF");
  assert.equal(settings.subtitle_font_size, 120);
  assert.equal(settings.subtitle_outline_width, 0);
  assert.equal(settings.subtitle_margin_percent, 40);
  assert.equal(settings.subtitle_margin_v, 140);

  const transcript = parseDeepgramTranscription({
    results: {
      channels: [{
        alternatives: [{
          transcript: "Привет, коллаген.",
          words: [
            { word: "привет", punctuated_word: "Привет,", start: 0.123, end: 0.456, confidence: 0.98765 },
            { word: "коллаген", punctuated_word: "коллаген.", start: 0.5, end: 1.1, confidence: 0.91 },
            { word: "", start: 1.2, end: 1.3 },
            { word: "bad", start: 2, end: 1 },
          ],
        }],
      }],
    },
  });
  assert.equal(transcript.words.length, 2);
  assert.deepEqual(transcript.words.map((word) => word.punctuated_word), ["Привет,", "коллаген."]);
  assert.equal(transcript.words[0].start, 0.12);
  assert.equal(transcript.words[0].confidence, 0.988);

  console.log("Omni subtitles contract checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function linkAlias(relativeFile) {
  const source = join(compiled, relativeFile);
  const target = join(output, "node_modules", "@", relativeFile);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}

function findFile(dir, fileName) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      try {
        return findFile(entryPath, fileName);
      } catch {
        continue;
      }
    }
    if (entry.name === fileName) return entryPath;
  }
  throw new Error(`Could not find ${fileName} in ${dir}`);
}
