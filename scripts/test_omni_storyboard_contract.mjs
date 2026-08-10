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
const technicalMontageTerms = /punch[ -]?in|jump cut|match cut|speed ramp|object wipe|split[ -]?screen|freeze frame|j[ -]?cut|l[ -]?cut/iu;

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
  assert.ok(prompt.includes("Динамичный разговорный ролик по раскадровке"));
  assert.ok(prompt.includes("@storyboard_file"));
  assert.ok(prompt.includes("@product_file"));
  assert.ok(prompt.includes("Продукт из"));
  assert.ok(prompt.includes("не показывай саму раскадровку"));
  assert.ok(prompt.includes("телефон, экран, интерфейс, соцсети"));
  assert.ok(prompt.includes("Оживи панели"));
  assert.ok(prompt.includes("сохрани визуал"));
  assert.ok(prompt.includes("Лицо и личность персонажа бери из avatar/character reference"));
  assert.ok(prompt.includes("одежду, свет, фон, ракурс и действия бери из раскадровки"));
  assert.ok(prompt.includes("те же волосы, пробор, аксессуары"));
  assert.ok(prompt.includes("один и тот же полный комплект одежды"));
  assert.ok(prompt.includes("смотрит прямо в объектив"));
  assert.ok(prompt.includes("CAMERA AUTHORITY"));
  assert.ok(prompt.includes("follow each panel camera"));
  assert.ok(prompt.includes("no left-right/front-rear, seat"));
  const vehiclePrompt = renderer.renderCompactRussianOmniStoryboardPrompt({
    storyboard: buildValidStoryboard(),
    directorBrief: {
      ...buildDirectorBrief(),
      atmosphere: { ...buildDirectorBrief().atmosphere, setting: "inside a parked car" },
    },
  });
  assert.ok(vehiclePrompt.includes("VEHICLE CAMERA LOCK"));
  assert.ok(vehiclePrompt.includes("same side of the cabin"));
  assert.ok(vehiclePrompt.includes("exact front or rear seat"));
  const movingVehiclePrompt = renderer.renderCompactRussianOmniStoryboardPrompt({
    storyboard: buildValidStoryboard(),
    directorBrief: {
      ...buildDirectorBrief(),
      atmosphere: { ...buildDirectorBrief().atmosphere, setting: "inside a moving car" },
      camera: { ...buildDirectorBrief().camera, movements: ["handheld vehicle sway"] },
    },
  });
  assert.ok(movingVehiclePrompt.includes("handheld micro-vibration"));
  assert.ok(movingVehiclePrompt.includes("presenter is a passenger"));
  assert.ok(prompt.includes("Состояние продукта держи одинаковым"));
  assert.ok(prompt.includes("Ровно 5 живых эпизодов"));
  assert.ok(prompt.includes("Артикул есть в описании!"));
  assert.ok(!prompt.includes("DELIVERY DIRECTION"));
  assert.ok(prompt.includes("Точная реплика персонажа"));
  assert.ok(prompt.includes("на русском языке"));
  assert.ok(prompt.includes("произнеси строго указанную реплику"));
  assert.ok(prompt.includes("реплику в кавычках один раз"));
  assert.ok(!prompt.includes("Служебные блоки раскадровки"));
  assert.ok(!prompt.includes("Озвучка:"));
  assert.ok(!prompt.includes("Реплика персонажа:"));
  assert.equal(normalizedCount(prompt, buildValidStoryboard().voiceoverText), 1);
  assert.equal(normalizedCount(prompt, buildValidStoryboard().frames[0].spokenText), 1);
  assert.ok(prompt.includes("Без фоновой музыки"));
  assert.ok(prompt.includes("обе руки у лица"));
  assert.ok(!prompt.includes("субтитры примени как с референса"));
  assert.ok(!prompt.includes("действие: герой берет"));
  assert.ok(!prompt.includes("Раскадровка без повторного текста речи:"));
  assert.ok(prompt.length < 2800, "storyboard provider prompt must stay short");

  const finalPrompt = renderer.renderCompactRussianOmniStoryboardPrompt({
    storyboard: { ...buildValidStoryboard(), segmentIndex: 3 },
    segmentCount: 3,
  });
  assert.ok(finalPrompt.includes("Артикул есть в описании!"));
  assert.ok(finalPrompt.includes("@product_file"));
  assert.ok(finalPrompt.includes("Продукт из"));
  assert.ok(finalPrompt.includes("неизменная упаковка"));
  assert.ok(finalPrompt.includes("Состояние продукта держи одинаковым"));

  const physicalContract = "The product remains a cohesive soft translucent jelly dessert with a glossy surface and gentle elastic wobble. It keeps the same reference shape as one intact semi-solid mass.";
  const physicalPrompt = renderer.renderCompactRussianOmniStoryboardPrompt({
    storyboard: { ...buildValidStoryboard(), segmentIndex: 2 },
    productPhysicalContract: physicalContract,
  });
  assert.ok(physicalPrompt.includes("PRODUCT PHYSICAL CONTRACT:"));
  assert.ok(physicalPrompt.includes("cohesive soft translucent jelly dessert"));
  assert.equal(normalizedCount(physicalPrompt, "PRODUCT PHYSICAL CONTRACT:"), 1);

  const mixedProductStoryboard = buildValidStoryboard();
  mixedProductStoryboard.voiceoverText = "Кожа спокойная сон важен Пенка мягко очищает кожу Уход нужен каждый день Артикул в описании И все без лишней рекламы";
  mixedProductStoryboard.frames = [
    { ...mixedProductStoryboard.frames[0], spokenText: "Кожа спокойная сон важен", productPlacement: "в кадре только тематические объекты" },
    { ...mixedProductStoryboard.frames[1], spokenText: "Пенка мягко очищает кожу", productPlacement: "пенка в руке" },
    { ...mixedProductStoryboard.frames[2], spokenText: "Уход нужен каждый день", productPlacement: "в кадре только тематические объекты" },
    { ...mixedProductStoryboard.frames[3], spokenText: "Артикул в описании", productPlacement: "в кадре только тематические объекты" },
    { ...mixedProductStoryboard.frames[4], spokenText: "И все без лишней рекламы", productPlacement: "в кадре только тематические объекты" },
  ];
  const mixedProductPrompt = renderer.renderCompactRussianOmniStoryboardPrompt({
    storyboard: mixedProductStoryboard,
    productName: "Пенка",
  });
  assert.ok(mixedProductPrompt.includes("только кадры 2"));
  assert.ok(mixedProductPrompt.includes("в остальных кадрах вне кадра"));

  const visualCueProductPlan = builder.buildStoryboardFromCreativePlan({
    plan: {
      ...buildCreativePlan(),
      productRole: "background_prop",
      beats: [{ startSeconds: 0, endSeconds: 10, action: "Сценарный visual cue: продукт на столе крупным планом" }],
    },
    productName: "Geodemika Enzyme Cleansing Foam",
    characterContract: {
      identityLine: "approved avatar identity",
      clothingLine: "черный мужской лонгслив",
      sourceRuleLine: "avatar defines identity",
      clothingSource: "avatar",
    },
    segmentIndex: 2,
    durationSeconds: 10,
  });
  assert.ok(visualCueProductPlan.frames.every((frame) => frame.productPlacement.includes("только тематические объекты")));
  assert.ok(visualCueProductPlan.frames.every((frame) => !/продукт|пенк|упаков/iu.test(frame.visualAction)));

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
  const directorStoryboardText = directorStoryboard.frames
    .flatMap((frame) => Object.values(frame).filter(Boolean))
    .join("\n");
  assert.ok(directorStoryboard.frames[0].environment.includes("warm amber studio wall"));
  assert.ok(directorStoryboard.frames[0].wardrobe.includes("black fitted turtleneck"));
  assert.ok(directorStoryboard.frames[0].productPlacement.includes("продукт вне кадра"));
  assert.ok(directorStoryboard.frames[0].camera.includes("medium close-up"));
  assert.ok(directorStoryboard.frames[0].wardrobe.includes("ONE EXACT OUTFIT FOR THE WHOLE REEL"));
  assert.ok(directorStoryboard.frames[0].wardrobe.includes("ONE EXACT FABRIC FOR THE WHOLE REEL"));
  assert.ok(!directorStoryboard.frames[0].wardrobe.includes("keep the black fitted high-neck silhouette on the avatar"));
  assert.equal(directorStoryboard.frames.length, 5);
  assert.ok(directorStoryboard.frames[2].visualAction.includes("вечерняя спальня"));
  assert.ok(directorStoryboard.frames[2].visualAction.includes("полезной едой"));
  assert.ok(directorStoryboard.frames[2].productPlacement.includes("продукт вне кадра"));
  assert.doesNotMatch(directorStoryboardText, /коллаген|product|товар|упаковк/iu);
  assert.equal(new Set(directorStoryboard.frames.map((frame) => frame.wardrobe)).size, 1);

  const maleAdaptedWardrobeBrief = buildDirectorBrief();
  maleAdaptedWardrobeBrief.clothing.adaptation_notes = "adapt the original women's shirt styling to the male avatar";
  const maleAdaptedStoryboard = builder.buildStoryboardFromCreativePlan({
    plan: buildCreativePlan(),
    productName: "Коллаген",
    characterContract: {
      identityLine: "approved male avatar identity",
      clothingLine: "fallback light top",
      sourceRuleLine: "avatar defines identity",
      clothingSource: "fallback",
    },
    segmentIndex: 1,
    durationSeconds: 10,
    directorBrief: maleAdaptedWardrobeBrief,
    wardrobeSource: "director_reference",
  });
  assert.ok(maleAdaptedStoryboard.frames[0].wardrobe.includes("black fitted turtleneck"));
  assert.ok(!maleAdaptedStoryboard.frames[0].wardrobe.includes("fallback light top"));
  assert.ok(
    directorStoryboard.frames.filter((frame) => !/перебивка/iu.test(frame.camera)).every((frame) => frame.camera.includes("смотрит прямо в объектив")),
    "talking-head storyboard camera lines must keep eye contact"
  );
  assert.equal(new Set(directorStoryboard.frames.map((frame) => frame.camera)).size, 1, "reference camera lock must prevent automatic camera alternation");
  assert.ok(directorStoryboard.frames[0].camera.includes("reference camera lock"), "director storyboard must use the analyzed reference camera");
  assert.doesNotMatch(`${prompt}\n${finalPrompt}\n${directorStoryboardText}`, technicalMontageTerms);

  const referenceActionStoryboard = builder.buildStoryboardFromCreativePlan({
    plan: buildCreativePlan(),
    productName: "Коллаген",
    characterContract: {
      identityLine: "approved avatar identity",
      clothingLine: "черный мужской лонгслив",
      sourceRuleLine: "avatar defines identity",
      clothingSource: "avatar",
    },
    segmentIndex: 1,
    segmentCount: 3,
    durationSeconds: 10,
    directorBrief: {
      ...buildDirectorBrief(),
      action_beats: [
        { timestamp_sec: 0, action_description: "Герой сидит лицом к камере", actor_gesture: "руки сложены" },
        { timestamp_sec: 8, action_description: "Герой слегка наклоняется к камере", actor_gesture: "делает короткий жест рукой" },
        { timestamp_sec: 18, action_description: "Крупная деталь рук на столе", actor_gesture: "пальцы касаются предмета" },
        { timestamp_sec: 28, action_description: "Герой возвращается к лицу", actor_gesture: "спокойно кивает" },
      ],
    },
    wardrobeSource: "director_reference",
  });
  assert.ok(
    referenceActionStoryboard.frames.some((frame) => /наклоняется|жест рукой|деталь рук/iu.test(frame.visualAction)),
    "storyboard must transfer a reference action beat into a matching frame"
  );
  assert.ok(
    referenceActionStoryboard.frames.some((frame) => /говорит в камеру|смотрит прямо в объектив/iu.test(frame.visualAction + frame.camera)),
    "reference action transfer must keep talking-head frames when reference has no cutaway"
  );
  assert.ok(
    referenceActionStoryboard.frames.every((frame) => !/^смысловой кадр окружения по теме хука$/iu.test(frame.visualAction)),
    "reference-driven storyboard must not fall back to an empty generic environment frame"
  );
  assert.doesNotMatch(
    referenceActionStoryboard.frames.map((frame) => frame.visualAction).join(" "),
    /ретинол|retinol|spf/iu,
    "reference action transfer must not copy source-topic details"
  );

  const mixedTopicStoryboard = builder.buildStoryboardFromCreativePlan({
    plan: {
      ...buildCreativePlan(),
      segmentIndex: 2,
      voiceoverText: "Я использую пенку Geodemika, она мягко очищает кожу. Полноценный сон, вода и питание поддерживают естественное восстановление кожи и помогают сохранять спокойный ровный тон каждый день.",
      productRole: "background_prop",
      beats: [
        { startSeconds: 0, endSeconds: 4, action: "Сценарный visual cue: пенка Geodemika в естественной ванной комнате" },
        { startSeconds: 4, endSeconds: 8, action: "Сценарный visual cue: вечерняя спальня, вода и полноценная еда" },
        { startSeconds: 8, endSeconds: 10, action: "персонаж возвращается к камере" },
      ],
    },
    productName: "Geodemika Enzyme Cleansing Foam",
    characterContract: {
      identityLine: "approved avatar identity",
      clothingLine: "черный мужской лонгслив",
      sourceRuleLine: "avatar defines identity",
      clothingSource: "avatar",
    },
    segmentIndex: 2,
    durationSeconds: 10,
  });
  assert.ok(mixedTopicStoryboard.frames[0].productPlacement.includes("вспомогательный предмет"));
  assert.ok(!mixedTopicStoryboard.frames[0].camera.includes("крупный кадр продукта"));
  assert.ok(!mixedTopicStoryboard.frames[1].camera.includes("крупный кадр продукта"));
  assert.ok(mixedTopicStoryboard.frames[2].visualAction.includes("вечерняя спальня"));
  assert.ok(mixedTopicStoryboard.frames[2].productPlacement.includes("тематические объекты"));

  const articleCtaStoryboard = builder.buildStoryboardFromCreativePlan({
    plan: {
      ...buildCreativePlan(),
      voiceoverText: "Пенка Geodemika мягко очищает кожу. Артикул по ней добавлю в описание, а дальше важны сон и питание для спокойной кожи каждый день.",
      productRole: "background_prop",
      beats: [
        { startSeconds: 0, endSeconds: 4, action: "Сценарный visual cue: пенка Geodemika на раковине" },
        { startSeconds: 4, endSeconds: 8, action: "Сценарный visual cue: герой говорит про артикул без показа продукта" },
        { startSeconds: 8, endSeconds: 10, action: "персонаж возвращается к камере" },
      ],
    },
    productName: "Geodemika Enzyme Cleansing Foam",
    characterContract: {
      identityLine: "approved avatar identity",
      clothingLine: "черный мужской лонгслив",
      sourceRuleLine: "avatar defines identity",
      clothingSource: "avatar",
    },
    segmentIndex: 2,
    durationSeconds: 10,
  });
  assert.ok(!articleCtaStoryboard.frames.some((frame) => frame.camera.includes("крупный кадр продукта")));

  const maleSafeStoryboard = builder.buildStoryboardFromCreativePlan({
    plan: { ...buildCreativePlan(), productRole: "natural_use" },
    productName: "Пенка",
    characterContract: {
      identityLine: "approved male avatar identity",
      clothingLine: "черный мужской лонгслив и темные брюки из avatar",
      sourceRuleLine: "avatar defines identity",
      clothingSource: "avatar",
      speechGender: "male",
      speechGenderLine: "мужской род",
    },
    segmentIndex: 2,
    durationSeconds: 10,
    directorBrief: {
      ...buildDirectorBrief(),
      clothing: {
        style: "Casual, fitted halter top with front buttons",
        color_palette: ["light yellow", "gold"],
        fit_details: "Form-fitting, ribbed texture, halter neckline",
        source: "main presenter",
        adaptation_notes: "female presenter outfit",
      },
    },
    wardrobeSource: "director_reference",
  });
  assert.ok(maleSafeStoryboard.frames[0].wardrobe.includes("черный мужской лонгслив"));
  assert.ok(!maleSafeStoryboard.frames[0].wardrobe.includes("halter"));

  assert.equal(
    fileReference.resolveOmniStoryboardFileReference([{ role: "product" }, { role: "storyboard" }]),
    "@file2"
  );
  assert.equal(fileReference.resolveOmniProductFileReference([{ role: "storyboard" }, { role: "product" }]), "@file2");
  const resolvedPrompt = fileReference.applyOmniStoryboardFileReference(finalPrompt, [
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
  assertInvalid(longSpeech, "frame_1_spoken_words_must_be_3_to_5");

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
    voiceoverText: "Чистая кожа зависит не только от умывания. Обратите внимание на сон, воду и полноценное питание, ведь ежедневный режим поддерживает естественное восстановление кожи.",
    productRole: "hidden",
    continuityProps: [],
    beats: [
      { startSeconds: 0, endSeconds: 4, action: "персонаж говорит в камеру" },
      { startSeconds: 4, endSeconds: 7, action: "Сценарный visual cue: вечерняя спальня, стакан воды и тарелка с полезной едой" },
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
