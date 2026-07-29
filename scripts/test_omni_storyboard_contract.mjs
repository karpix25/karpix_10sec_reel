import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
  mirrorAlias("lib/omni/storyboard");

  const types = require(findFile(compiled, "omni-storyboard-types.js"));
  const contract = require(findFile(compiled, "omni-storyboard-contract.js"));
  const renderer = require(findFile(compiled, "omni-storyboard-renderer.js"));
  const builder = require(findFile(compiled, "omni-storyboard-builder.js"));
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
  assert.ok(prompt.includes("Создай видео по раскадровке"));
  assert.ok(prompt.includes("@storyboard_file"));
  assert.ok(prompt.includes("@product_file"));
  assert.ok(prompt.includes("Продукт бери из"));
  assert.ok(prompt.includes("не меняй упаковку"));
  assert.ok(prompt.includes("не показывай саму раскадровку"));
  assert.ok(prompt.includes("телефон, экран, интерфейс, соцсети"));
  assert.ok(prompt.includes("Оживи кадры раскадровки"));
  assert.ok(prompt.includes("точно такой же визуал как в раскадровке"));
  assert.ok(prompt.includes("Лицо и личность персонажа бери из avatar/character reference"));
  assert.ok(prompt.includes("одежду, свет, фон, ракурс и действия бери из раскадровки"));
  assert.ok(prompt.includes("те же волосы, пробор, аксессуары"));
  assert.ok(prompt.includes("один и тот же комплект на весь ролик"));
  assert.ok(prompt.includes("не заменяй слой футболкой"));
  assert.ok(prompt.includes("смотрит прямо в объектив"));
  assert.ok(prompt.includes("Состояние продукта держи одинаковым"));
  assert.ok(prompt.includes("Структура видео: ровно 5 живых эпизодов"));
  assert.ok(prompt.includes("Артикул есть в описании!"));
  assert.ok(!prompt.includes("DELIVERY DIRECTION"));
  assert.ok(prompt.includes("Персонаж в кадре сам произносит эти слова"));
  assert.ok(prompt.includes("на русском языке"));
  assert.ok(prompt.includes("Не дублируй слова"));
  assert.ok(!prompt.includes("Служебные блоки раскадровки"));
  assert.ok(!prompt.includes("Озвучка:"));
  assert.ok(!prompt.includes("Реплика персонажа:"));
  assert.equal(normalizedCount(prompt, buildValidStoryboard().voiceoverText), 1);
  assert.equal(normalizedCount(prompt, buildValidStoryboard().frames[0].spokenText), 1);
  assert.ok(prompt.includes("Не добавляй музыку"));
  assert.ok(!prompt.includes("субтитры примени как с референса"));
  assert.ok(!prompt.includes("действие: герой берет"));
  assert.ok(!prompt.includes("Раскадровка без повторного текста речи:"));
  assert.ok(prompt.length < 1600, "storyboard provider prompt must stay short");

  const finalPrompt = renderer.renderCompactRussianOmniStoryboardPrompt({
    storyboard: { ...buildValidStoryboard(), segmentIndex: 3 },
    segmentCount: 3,
  });
  assert.ok(finalPrompt.includes("Артикул есть в описании!"));

  const physicalContract = "The product remains a cohesive soft translucent jelly dessert with a glossy surface and gentle elastic wobble. It keeps the same reference shape as one intact semi-solid mass.";
  const physicalPrompt = renderer.renderCompactRussianOmniStoryboardPrompt({
    storyboard: buildValidStoryboard(),
    productPhysicalContract: physicalContract,
  });
  assert.ok(physicalPrompt.includes("PRODUCT PHYSICAL CONTRACT:"));
  assert.ok(physicalPrompt.includes("cohesive soft translucent jelly dessert"));
  assert.equal(normalizedCount(physicalPrompt, "PRODUCT PHYSICAL CONTRACT:"), 1);

  const directorStoryboard = builder.buildStoryboardFromCreativePlan({
    plan: buildCreativePlan(),
    productName: "Коллаген",
    characterContract: {
      identityLine: "approved avatar identity",
      clothingLine: "молочная домашняя футболка из avatar",
      sourceRuleLine: "avatar defines identity",
      clothingSource: "avatar",
    },
    segmentIndex: 1,
    durationSeconds: 10,
    directorBrief: buildDirectorBrief(),
    wardrobeSource: "director_reference",
  });
  assert.ok(directorStoryboard.frames[0].environment.includes("warm amber studio wall"));
  assert.ok(directorStoryboard.frames[0].wardrobe.includes("black fitted turtleneck"));
  assert.ok(directorStoryboard.frames[0].camera.includes("medium close-up"));
  assert.ok(directorStoryboard.frames[0].wardrobe.includes("ONE EXACT OUTFIT FOR THE WHOLE REEL"));
  assert.ok(!directorStoryboard.frames[0].wardrobe.includes("keep the black fitted high-neck silhouette on the avatar"));
  assert.ok(
    directorStoryboard.frames.filter((frame) => !/перебивка/iu.test(frame.camera)).every((frame) => frame.camera.includes("смотрит прямо в объектив")),
    "talking-head storyboard camera lines must keep eye contact"
  );

  assert.equal(
    fileReference.resolveOmniStoryboardFileReference([{ role: "product" }, { role: "storyboard" }]),
    "@file2"
  );
  assert.equal(fileReference.resolveOmniProductFileReference([{ role: "storyboard" }, { role: "product" }]), "@file2");
  const resolvedPrompt = fileReference.applyOmniStoryboardFileReference(prompt, [
    { role: "storyboard" },
    { role: "product" },
  ]);
  assert.ok(resolvedPrompt.includes("@file1"));
  assert.ok(resolvedPrompt.includes("@file2"));
  assert.ok(!resolvedPrompt.includes("@storyboard_file"));
  assert.ok(!resolvedPrompt.includes("@product_file"));

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

function buildCreativePlan() {
  return {
    segmentIndex: 1,
    lifeFormatId: "talking_head_cutaways",
    speechStartsAtSeconds: 0,
    voiceoverText: "Ваш организм перестает вырабатывать коллаген после тридцати лет это естественный процесс коллаген это основной строительный белок для кожи суставов связок",
    productRole: "hidden",
    continuityProps: [],
    beats: [
      { startSeconds: 0, endSeconds: 4, action: "персонаж говорит в камеру" },
      { startSeconds: 4, endSeconds: 7, action: "персонаж делает жест рукой" },
      { startSeconds: 7, endSeconds: 10, action: "персонаж возвращается к камере" },
    ],
  };
}

function buildDirectorBrief() {
  return {
    visual_hook: { action: "presenter holds product", retention_trigger: "direct expert claim" },
    atmosphere: {
      mood: "premium expert talking-head",
      setting: "warm amber studio wall",
      lighting: "soft warm frontal key light",
      color_grading: "warm orange-brown grade",
    },
    clothing: {
      style: "black fitted turtleneck",
      color_palette: ["black"],
      fit_details: "clean high neck, close fit",
      source: "main presenter",
      adaptation_notes: "keep the black fitted high-neck silhouette on the avatar",
    },
    location_timeline: [
      {
        start_sec: 0,
        end_sec: 10,
        setting: "warm amber studio wall",
        environment: "minimal orange-brown interior backdrop",
        lighting: "soft warm frontal key light",
      },
    ],
    camera: {
      shot_types: ["medium close-up", "product close-up"],
      angles: ["eye-level"],
      movements: ["static handheld"],
      stabilization: "stable talking-head framing",
    },
    montage_rhythm: { cut_pace: "slow", beat_sync: "none", transition_style: ["hard cut"] },
    action_beats: [],
    prop_sources: [],
    hand_object_interactions: [],
    motion_continuity: [],
    reference_action_style: "talking head",
    reusable_mechanics: {
      visual_mechanics: ["direct-to-camera explanation"],
      safe_zones_for_elements: "lower center",
      looping_pattern: "return to same seated pose",
    },
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

function mirrorAlias(relativePath) {
  const source = join(compiled, relativePath);
  const target = join(output, "node_modules", "@", relativePath);
  mkdirSync(target, { recursive: true });
  cpSync(source, target, { recursive: true });
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
