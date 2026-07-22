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
      join(ui, "src/lib/server/subtitles.ts"),
      join(ui, "src/lib/server/omni/deepgram-transcription.ts"),
      join(ui, "src/types/index.ts"),
    ],
  }));

  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", tsconfig], { cwd: ui, stdio: "inherit" });
  linkAlias("lib/subtitles.js");

  const sharedSubtitles = require(join(compiled, "lib/subtitles.js"));
  const serverSubtitles = require(join(compiled, "lib/server/subtitles.js"));
  const {
    DEFAULT_SUBTITLE_FONT_FAMILY,
    DEFAULT_SUBTITLE_FONT_SIZE,
    DEFAULT_SUBTITLE_OUTLINE_WIDTH,
    DEFAULT_SUBTITLE_SHADOW,
    SUBTITLE_PRESET_DEFAULT_MARGIN_PERCENT,
    SUBTITLE_PRESET_DEFAULT_MARGIN_V,
    applyReelsSubtitleDefaultsToLegacy,
  } = sharedSubtitles;
  const { normalizeOmniSubtitleSettings } = require(findFile(compiled, "subtitle-settings.js"));
  const { buildAssContent, buildSubtitleEvents } = serverSubtitles;
  const { parseDeepgramTranscription } = require(findFile(compiled, "deepgram-transcription.js"));

  const defaultSettings = normalizeOmniSubtitleSettings({});
  assert.equal(defaultSettings.subtitle_mode, "phrase_block");
  assert.equal(defaultSettings.subtitle_style_preset, "impact");
  assert.equal(defaultSettings.subtitle_font_family, DEFAULT_SUBTITLE_FONT_FAMILY);
  assert.equal(defaultSettings.subtitle_font_size, DEFAULT_SUBTITLE_FONT_SIZE);
  assert.equal(defaultSettings.subtitle_outline_width, DEFAULT_SUBTITLE_OUTLINE_WIDTH);
  assert.equal(defaultSettings.subtitle_margin_percent, SUBTITLE_PRESET_DEFAULT_MARGIN_PERCENT.impact);

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
  assert.equal(settings.subtitle_margin_v, SUBTITLE_PRESET_DEFAULT_MARGIN_V.impact);

  const migrated = applyReelsSubtitleDefaultsToLegacy({
    subtitle_mode: "word_by_word",
    subtitle_style_preset: "classic",
    subtitle_font_family: "pt_sans",
    subtitle_font_size: 38,
    subtitle_outline_width: 3,
    subtitle_margin_v: 140,
    subtitle_margin_percent: 11,
  });
  assert.equal(migrated.subtitle_mode, "phrase_block");
  assert.equal(migrated.subtitle_style_preset, "impact");
  assert.equal(migrated.subtitle_font_family, DEFAULT_SUBTITLE_FONT_FAMILY);
  assert.equal(migrated.subtitle_font_size, DEFAULT_SUBTITLE_FONT_SIZE);
  assert.equal(migrated.subtitle_margin_percent, SUBTITLE_PRESET_DEFAULT_MARGIN_PERCENT.impact);

  const eventSettings = {
    subtitles_enabled: true,
    subtitle_mode: "phrase_block",
    subtitle_style_preset: "impact",
    subtitle_font_family: DEFAULT_SUBTITLE_FONT_FAMILY,
    subtitle_font_color: "#FFFFFF",
    subtitle_font_size: DEFAULT_SUBTITLE_FONT_SIZE,
    subtitle_font_weight: 700,
    subtitle_outline_color: "#111111",
    subtitle_outline_width: DEFAULT_SUBTITLE_OUTLINE_WIDTH,
    subtitle_margin_v: SUBTITLE_PRESET_DEFAULT_MARGIN_V.impact,
    subtitle_margin_percent: SUBTITLE_PRESET_DEFAULT_MARGIN_PERCENT.impact,
    typography_hook_enabled: false,
  };
  const events = buildSubtitleEvents([
    { word: "делай", punctuated_word: "делай", start: 0, end: 0.2 },
    { word: "проще", punctuated_word: "проще", start: 0.22, end: 0.45 },
    { word: "и", punctuated_word: "и", start: 0.46, end: 0.6 },
    { word: "быстрее", punctuated_word: "быстрее", start: 0.62, end: 0.9 },
    { word: "каждый", punctuated_word: "каждый", start: 0.92, end: 1.12 },
    { word: "день", punctuated_word: "день", start: 1.14, end: 1.35 },
  ], eventSettings, 3);
  assert(events.length >= 2);
  assert(events.every((event) => event.text === event.text.toUpperCase()));
  assert(events.every((event) => event.text.split(/\s+/).length <= 3));

  const ass = buildAssContent(events, "Montserrat", eventSettings);
  const expectedMarginV = Math.round((SUBTITLE_PRESET_DEFAULT_MARGIN_PERCENT.impact / 100) * 1920);
  assert.match(ass, /Style: Subtitle,Montserrat,64,/);
  assert.match(ass, new RegExp(`,${DEFAULT_SUBTITLE_SHADOW},2,63,63,${expectedMarginV},1`));
  assert.match(ass, /Dialogue: 0,0:00:00\.00,0:00:00\.60,Subtitle,,0,0,0,,ДЕЛАЙ ПРОЩЕ И/);

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
