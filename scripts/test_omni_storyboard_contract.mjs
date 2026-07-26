import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-storyboard-contract-"));
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
      join(ui, "src/lib/omni/storyboard/**/*.ts"),
      join(ui, "src/lib/server/omni/storyboard/**/*.ts"),
    ],
  }));

  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", tsconfig], { cwd: ui, stdio: "inherit" });

  const types = require(findFile(compiled, "omni-storyboard-types.js"));
  const contract = require(findFile(compiled, "omni-storyboard-contract.js"));
  const renderer = require(findFile(compiled, "omni-storyboard-renderer.js"));
  const fileReference = require(findFile(compiled, "omni-storyboard-file-reference.js"));

  assert.deepEqual([...types.OMNI_STORYBOARD_ALLOWED_SEGMENT_SECONDS], [4, 6, 8, 10]);
  assert.equal(types.getOmniStoryboardFrameCount(4), 2);
  assert.equal(types.getOmniStoryboardFrameCount(6), 3);
  assert.equal(types.getOmniStoryboardFrameCount(8), 4);
  assert.equal(types.getOmniStoryboardFrameCount(10), 5);

  const valid = contract.validateOmniStoryboardSegment(buildValidStoryboard());
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.errors, []);
  assert.equal(contract.countOmniStoryboardSpokenWords("Вкус мягкий, совсем не сладкий."), 5);
  assert.equal(
    contract.normalizeOmniStoryboardSpeech("Даёт лёгкость, утром!"),
    "дает легкость утром"
  );

  const prompt = renderer.renderCompactRussianOmniStoryboardPrompt({ storyboard: buildValidStoryboard() });
  assert.ok(prompt.includes("используй раскадровку как референс"));
  assert.ok(prompt.includes("@storyboard_file"));
  assert.ok(prompt.includes("повтори в точности количество кадров"));
  assert.ok(prompt.includes("такой же ракурс камеры"));
  assert.ok(prompt.includes("Озвучивай слова в точности как написано"));
  assert.ok(prompt.includes("без повторов и добавлений"));
  assert.ok(!prompt.includes("Служебные блоки раскадровки"));
  assert.ok(prompt.includes("Озвучка:"));
  assert.equal(normalizedCount(prompt, buildValidStoryboard().voiceoverText), 1);
  assert.ok(prompt.includes("не добавляй музыку"));
  assert.ok(prompt.includes("не добавляй музыку и субтитры"));
  assert.ok(!prompt.includes("субтитры примени как с референса"));
  assert.ok(!prompt.includes("действие: герой берет"));
  assert.ok(!prompt.includes("Раскадровка без повторного текста речи:"));
  assert.ok(prompt.length < 1100, "storyboard provider prompt must stay short");
  assert.equal(
    fileReference.resolveOmniStoryboardFileReference([{ role: "product" }, { role: "storyboard" }]),
    "@file2"
  );
  assert.equal(
    fileReference.applyOmniStoryboardFileReference(prompt, [{ role: "storyboard" }, { role: "product" }]).includes("@file1"),
    true
  );

  assertInvalid(
    { ...buildValidStoryboard(), frames: buildValidStoryboard().frames.slice(0, 4) },
    "segment_must_have_exactly_5_storyboard_frames"
  );
  assertInvalid(
    { ...buildValidStoryboard(), durationSeconds: 7 },
    "segment_duration_must_be_4_6_8_or_10_seconds"
  );
  assertInvalid(
    { ...buildValidStoryboard(), durationSeconds: 8 },
    "segment_must_have_exactly_4_storyboard_frames"
  );

  const longSpeech = buildValidStoryboard();
  longSpeech.frames[0] = { ...longSpeech.frames[0], spokenText: "Утром я очень быстро беру стик" };
  assertInvalid(longSpeech, "frame_1_spoken_words_must_be_4_to_5");

  const mismatch = buildValidStoryboard();
  mismatch.frames[4] = { ...mismatch.frames[4], spokenText: "Артикул будет в профиле" };
  assertInvalid(mismatch, "joined_frame_speech_must_match_segment_voiceover");

  const emptyCamera = buildValidStoryboard();
  emptyCamera.frames[1] = { ...emptyCamera.frames[1], camera: "   " };
  assertInvalid(emptyCamera, "frame_2_camera_required");

  const musicCue = buildValidStoryboard();
  musicCue.frames[2] = { ...musicCue.frames[2], sfxNotes: "легкая музыка на фоне" };
  assertInvalid(musicCue, "frame_3_sfxNotes_must_not_include_music_cue");

  assert.throws(
    () => renderer.renderCompactRussianOmniStoryboardPrompt({ storyboard: musicCue }),
    /Invalid Omni storyboard/u
  );

  console.log("Omni storyboard contract checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function assertInvalid(storyboard, expectedError) {
  const result = require(findFile(compiled, "omni-storyboard-contract.js"))
    .validateOmniStoryboardSegment(storyboard);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes(expectedError), `${expectedError} missing from ${result.errors.join(", ")}`);
}

function buildValidStoryboard() {
  const frames = [
    ["Утром я беру стик", "герой берет стик с кухонной полки", "средний план на уровне глаз", "светлая кухня, утренний стол", "серый худи и темные джинсы", "стик лежит в руке у груди", "шорох упаковки", "чистая натуральная картинка"],
    ["показываю упаковку крупно в камеру", "герой показывает упаковку ближе к объективу", "крупный план рук сверху", "тот же стол, мягкий свет", "те же рукава серого худи", "упаковка в центре кадра", "тихий звук стик-пакета", "чистая натуральная картинка"],
    ["объясняю почему это удобно", "герой делает короткую перебивку на продукт", "полукрупный план сбоку", "кухня остается на фоне", "серый худи без смены деталей", "продукт виден рядом с рукой", "легкий стук упаковки", "чистая натуральная картинка"],
    ["вкус мягкий и апельсиновый", "герой спокойно кивает и улыбается", "статичный средний план", "утренний стол и окно", "тот же худи, аккуратный ворот", "упаковка стоит рядом", "тихий выдох", "чистая натуральная картинка"],
    ["Артикул есть в описании", "герой кладет упаковку рядом с камерой", "камера чуть опускается к столу", "кухонная поверхность крупнее", "рукав худи входит в край кадра", "упаковка обращена к камере", "легкий стук упаковки", "чистый финальный фокус"],
  ].map(([spokenText, visualAction, camera, environment, wardrobe, productPlacement, sfxNotes, effectNotes]) => ({
    spokenText,
    visualAction,
    camera,
    environment,
    wardrobe,
    productPlacement,
    sfxNotes,
    effectNotes,
  }));

  return {
    segmentIndex: 1,
    durationSeconds: 10,
    voiceoverText: "Утром я беру стик показываю упаковку крупно в камеру объясняю почему это удобно вкус мягкий и апельсиновый Артикул есть в описании",
    frames,
  };
}

function normalizedCount(haystack, needle) {
  const normalizedHaystack = normalize(haystack);
  const normalizedNeedle = normalize(needle);
  return normalizedNeedle ? normalizedHaystack.split(normalizedNeedle).length - 1 : 0;
}

function normalize(value) {
  return String(value).toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
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
