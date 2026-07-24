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

  assert.equal(types.FIVE_FRAMES_PER_TEN_SECONDS, 5);

  const valid = contract.validateOmniStoryboardSegment(buildValidStoryboard());
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.errors, []);
  assert.equal(contract.countOmniStoryboardSpokenWords("Вкус мягкий, не сладкий."), 4);
  assert.equal(
    contract.normalizeOmniStoryboardSpeech("Даёт лёгкость, утром!"),
    "дает легкость утром"
  );

  const prompt = renderer.renderCompactRussianOmniStoryboardPrompt({ storyboard: buildValidStoryboard() });
  assert.ok(prompt.includes("Вертикальное 9:16 видео, 10 секунд."));
  assert.ok(prompt.includes("Свою музыку не добавляй."));
  assert.ok(prompt.includes("1) речь: \"Утром я беру\""));
  assert.ok(prompt.length < 1800, "storyboard provider prompt must stay compact");

  assertInvalid(
    { ...buildValidStoryboard(), frames: buildValidStoryboard().frames.slice(0, 4) },
    "segment_must_have_exactly_5_storyboard_frames"
  );
  assertInvalid(
    { ...buildValidStoryboard(), durationSeconds: 8 },
    "segment_duration_must_be_10_seconds"
  );

  const longSpeech = buildValidStoryboard();
  longSpeech.frames[0] = { ...longSpeech.frames[0], spokenText: "Утром я быстро беру стик" };
  assertInvalid(longSpeech, "frame_1_spoken_words_must_be_3_to_4");

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
    ["Утром я беру", "герой берет стик с кухонной полки", "средний план на уровне глаз", "светлая кухня, утренний стол", "серый худи и темные джинсы", "стик лежит в руке у груди", "шорох упаковки", "мягкий световой блик"],
    ["стик и размешиваю его", "герой высыпает порошок в стакан", "крупный план рук сверху", "тот же стол, прозрачный стакан", "те же рукава серого худи", "стик и стакан в центре кадра", "тихий звук стик-пакета", "легкое завихрение в воде"],
    ["в воде пью", "герой делает короткий глоток", "полукрупный план сбоку", "кухня остается на фоне", "серый худи без смены деталей", "стакан у лица, продукт виден сбоку", "звук стакана о стол", "короткий натуральный blur движения"],
    ["спокойно вкус мягкий", "герой спокойно кивает после глотка", "статичный средний план", "утренний стол и окно", "тот же худи, аккуратный ворот", "упаковка стоит у стакана", "тихий выдох", "теплая вспышка света на окне"],
    ["Артикул есть в описании", "герой кладет стик рядом со стаканом", "камера чуть опускается к столу", "кухонная поверхность крупнее", "рукав худи входит в край кадра", "артикул на упаковке обращен к камере", "легкий стук упаковки", "чистый финальный фокус"],
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
    voiceoverText: "Утром я беру стик и размешиваю его в воде. Пью спокойно, вкус мягкий. Артикул есть в описании.",
    frames,
  };
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
